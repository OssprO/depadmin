#!/usr/bin/env bash
# Runs on the VPS (docs/DESPLIEGUE.md §9, ADR-0030):
#   ./backup.sh          every night, from cron: dumps the database into the encrypted
#                        repository on the VPS, copies it to Backblaze B2, keeps 14 daily,
#                        8 weekly and 12 monthly copies in both and tells healthchecks.io
#   ./backup.sh local    from deploy.sh, before the migrations: only the repository on the VPS
#   ./backup.sh init     once: creates both repositories
#   ./backup.sh list     the copies in both repositories
# The dumps hold everything (names, payments, password hashes): restic encrypts them with
# RESTIC_PASSWORD, which must also be kept off the VPS, or no backup can be restored.
set -eEuo pipefail
cd "$(dirname "$0")"

mode="${1:-nightly}"
dir="${BACKUP_DIR:-/var/backups/depadmin}"
keep=(--host depadmin --keep-daily 14 --keep-weekly 8 --keep-monthly 12)
umask 077
mkdir -p "$dir"

# The last value of a variable in .env; cron gives the script no environment of its own.
env_value() { sed -n "s/^$1=//p" .env | tail -n 1; }
remote="$(env_value RESTIC_REMOTE_REPOSITORY)"
ping_url="$(env_value HEALTHCHECKS_PING_URL)"

# Tells healthchecks.io how the backup went: "" (done), /start or /fail, with a note.
ping() {
  [[ -n "$ping_url" && "$mode" == nightly ]] || return 0
  curl -fsS -m 10 --retry 3 -o /dev/null --data-raw "${2:-}" "${ping_url}/backup${1}?create=1" ||
    echo "backup: could not reach healthchecks.io" >&2
}
restic() { docker compose --progress quiet run --rm -T --user "$(id -u):$(id -g)" restic "$@"; }
dump() { docker compose exec -T db pg_dump -U depadmin -d depadmin --format=custom; }

if [[ -z "$(env_value RESTIC_PASSWORD)" ]]; then
  # Until restic is set up (docs/DESPLIEGUE.md §9), a plain dump as before, and a warning.
  file="${dir}/depadmin-$(date +%Y%m%d-%H%M).dump"
  dump > "${file}.part"
  mv "${file}.part" "$file"
  find "${dir:?}" -maxdepth 1 -name 'depadmin-*.dump' -mtime +14 -delete
  echo "$(date -Is) backup: $file, NOT encrypted: set up restic (docs/DESPLIEGUE.md §9)" >&2
  ping /fail "restic is not set up (docs/DESPLIEGUE.md §9)"
  exit 0
fi
if [[ "$mode" != local && -z "$remote" ]]; then
  echo "backup: set RESTIC_REMOTE_REPOSITORY in .env (docs/DESPLIEGUE.md §9)" >&2
  exit 1
fi

case "$mode" in
  init)
    restic init
    restic -r "$remote" init --from-repo /backups/restic --copy-chunker-params
    exit 0
    ;;
  list)
    echo "On the VPS:"
    restic snapshots --host depadmin --compact
    echo "In B2:"
    restic -r "$remote" snapshots --host depadmin --compact
    exit 0
    ;;
  local | nightly) ;;
  *)
    echo "usage: ./backup.sh [local|init|list]" >&2
    exit 2
    ;;
esac

# Each step names itself, so the failure that healthchecks.io emails says where it stopped.
step=start
trap 'ping /fail "failed at: $step"' ERR
ping /start

# The dump goes whole to a file first: piped straight in, a dump that fails halfway would
# still leave a snapshot. The plain file lives only until restic has it.
staging="${dir}/.depadmin.dump.part"
trap 'rm -f "$staging"' EXIT
step="dumping the database"
dump > "$staging"
step="saving it on the VPS"
restic backup --host depadmin --tag "$mode" --stdin --stdin-filename depadmin.dump --quiet < "$staging"
rm -f "$staging"

if [[ "$mode" == nightly ]]; then
  step="forgetting old copies on the VPS"
  restic forget "${keep[@]}" --prune --quiet
  step="copying to B2"
  restic -r "$remote" copy --from-repo /backups/restic --quiet
  step="forgetting old copies in B2"
  restic -r "$remote" forget "${keep[@]}" --prune --quiet
  step="checking B2"
  restic -r "$remote" check --quiet
  # The plain dumps from before restic, once they are two weeks old.
  find "${dir:?}" -maxdepth 1 -name 'depadmin-*.dump' -mtime +14 -delete
fi

step=summary
summary="$(restic snapshots --host depadmin --latest 1 --compact | grep -E '^[0-9a-f]{8} ' | tail -n 1)"
echo "$(date -Is) backup (${mode}): ${summary}"
ping "" "$summary"
