#!/usr/bin/env bash
# Runs on the VPS, from the Deploy workflow or by hand:  ./deploy.sh <version>
# Pulls that version, backs up the database, applies the migrations and replaces the
# containers that changed. If the new version doesn't come up healthy, it brings back the
# one that was running and fails, so the workflow shows it.
set -euo pipefail
cd "$(dirname "$0")"

tag="${1:?usage: ./deploy.sh <version, e.g. 1.0.3, or a commit sha>}"
previous="$(sed -n 's/^DEPADMIN_TAG=//p' .env)"

set_tag() {
  if grep -q '^DEPADMIN_TAG=' .env; then
    sed -i "s/^DEPADMIN_TAG=.*/DEPADMIN_TAG=$1/" .env
  else
    echo "DEPADMIN_TAG=$1" >> .env
  fi
}

# Only the app's images (migrate uses the api one): Postgres changes only on purpose
# (docs/DESPLIEGUE.md). The tag goes in the environment, which wins over .env, so .env
# keeps naming the running version until the new one is here.
if ! DEPADMIN_TAG="$tag" timeout 600 docker compose pull --quiet api web; then
  echo "deploy: could not pull ${tag}; ${previous:-nothing} keeps running" >&2
  exit 1
fi

# A copy from just before the migrations, the one to restore if this version must go back.
if docker compose ps --status running --services | grep -qx db; then
  ./backup.sh local
fi

set_tag "$tag"
# --wait returns once everything is healthy, and fails if not.
if ! docker compose up --detach --wait --wait-timeout 300 --remove-orphans; then
  echo "deploy: ${tag} did not come up healthy" >&2
  docker compose logs --tail 50 migrate api web >&2 || true
  if [[ -n "$previous" && "$previous" != "$tag" ]]; then
    echo "deploy: going back to ${previous}" >&2
    set_tag "$previous"
    docker compose up --detach --wait --wait-timeout 300 --remove-orphans || true
  fi
  exit 1
fi

# Earlier versions of this app's images, now unused (the label is set in the Dockerfile).
docker image prune --all --force --filter "label=org.opencontainers.image.source=https://github.com/OssprO/depadmin"
docker compose ps
