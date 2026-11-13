#!/usr/bin/env bash
# Proves the backups can be restored (docs/DESPLIEGUE.md §9, ADR-0030): restores the latest
# one from Backblaze B2 into a database of its own, counts its rows and drops it. The app's
# database is never touched. Run it every three months; healthchecks.io reminds you.
set -eEuo pipefail
cd "$(dirname "$0")"

dir="${BACKUP_DIR:-/var/backups/depadmin}"
scratch=prueba_restauracion
umask 077

env_value() { sed -n "s/^$1=//p" .env | tail -n 1; }
remote="$(env_value RESTIC_REMOTE_REPOSITORY)"
ping_url="$(env_value HEALTHCHECKS_PING_URL)"
: "${remote:?set RESTIC_REMOTE_REPOSITORY in .env (docs/DESPLIEGUE.md §9)}"

ping() {
  [[ -n "$ping_url" ]] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null --data-raw "${2:-}" "${ping_url}/restore-test${1}?create=1" ||
    echo "restore-test: could not reach healthchecks.io" >&2
}
psql() { docker compose exec -T -e PGOPTIONS="-c client_min_messages=warning" db psql -U depadmin -v ON_ERROR_STOP=1 "$@"; }

staging="${dir}/.restore-test.dump.part"
cleanup() {
  rm -f "$staging"
  psql -d depadmin -qc "DROP DATABASE IF EXISTS ${scratch}" > /dev/null || true
}
trap cleanup EXIT
step=start
trap 'ping /fail "failed at: $step"' ERR

step="downloading the latest backup from B2"
docker compose --progress quiet run --rm -T --user "$(id -u):$(id -g)" restic -r "$remote" \
  dump --host depadmin latest /depadmin.dump > "$staging"
step="restoring it"
psql -d depadmin -qc "DROP DATABASE IF EXISTS ${scratch}" -c "CREATE DATABASE ${scratch}"
docker compose exec -T db pg_restore -U depadmin -d "$scratch" --no-owner --exit-on-error < "$staging"
step="counting its rows"
counts="$(psql -d "$scratch" -tAc "SELECT 'movimientos ' || (SELECT count(*) FROM cash_movement) || ', usuarios ' || (SELECT count(*) FROM app_user) || ', bitácora ' || (SELECT count(*) FROM audit_log)")"

echo "$(date -Is) restore-test: OK (${counts})"
ping "" "$counts"
