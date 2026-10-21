#!/usr/bin/env bash
# Runs on the VPS every night (cron, docs/DESPLIEGUE.md): dumps the database and keeps the
# last BACKUP_DAYS days. The dumps hold everything (names, payments, password hashes): only
# their owner can read them.
set -euo pipefail
cd "$(dirname "$0")"

dir="${BACKUP_DIR:-/var/backups/depadmin}"
days="${BACKUP_DAYS:-14}"
umask 077
mkdir -p "$dir"

file="${dir}/depadmin-$(date +%Y%m%d-%H%M).dump"
docker compose exec -T db pg_dump -U depadmin -d depadmin --format=custom > "${file}.part"
mv "${file}.part" "$file"
find "${dir:?}" -maxdepth 1 -name 'depadmin-*.dump' -mtime +"$days" -delete
echo "$(date -Is) backup: $file ($(du -h "$file" | cut -f1))"
