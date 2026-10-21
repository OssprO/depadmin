#!/usr/bin/env bash
# Runs on the VPS, from the Deploy workflow or by hand:  ./deploy.sh <version>
# Pulls that version, applies the migrations and replaces the containers that changed.
set -euo pipefail
cd "$(dirname "$0")"

tag="${1:?usage: ./deploy.sh <version, e.g. 1.0.3, or a commit sha>}"
if grep -q '^DEPADMIN_TAG=' .env; then
  sed -i "s/^DEPADMIN_TAG=.*/DEPADMIN_TAG=${tag}/" .env
else
  echo "DEPADMIN_TAG=${tag}" >> .env
fi

docker compose pull --quiet
# --wait returns once everything is healthy, and fails (failing the workflow) if not.
docker compose up --detach --wait --remove-orphans
# Earlier versions of this app's images, now unused (the label is set in the Dockerfile).
docker image prune --all --force --filter "label=org.opencontainers.image.source=https://github.com/OssprO/depadmin"
docker compose ps
