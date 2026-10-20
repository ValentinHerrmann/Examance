#!/usr/bin/env bash
# Restore this stack from its restic backup (docs/dev/storage_partitions.md, issue #114).
# Shipped by the deploy workflows next to docker-compose.deploy.yml and .env; run it from there.
#
#   ./restore-backup.sh list                 snapshots of the database and of the scan files
#   ./restore-backup.sh db <id|latest>       replace the WHOLE database with that snapshot
#   ./restore-backup.sh undo                 go back to the state just before the last `db` restore
#   ./restore-backup.sh scans <id|latest>    copy back scan files missing from the blob dir
#
# Before loading a snapshot, `db` saves the current state twice: as a restic snapshot tagged
# `pre-restore` (off-site, listed by `list`, restorable with `db <id>`; never picked by `latest`)
# and as a local file for `undo`. A failed restore puts
# that state back at once. Add --yes to skip the confirmation prompt.
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
[ -f .env ] && [ -f docker-compose.deploy.yml ] \
  || { echo "Run this next to .env and docker-compose.deploy.yml." >&2; exit 1; }

case "$(basename "$PWD")" in
  prod) PROJECT=examance-prod ;;
  preview) PROJECT=examance-preview ;;
  *) PROJECT="${EXAMANCE_PROJECT:?not in a prod/preview dir: set EXAMANCE_PROJECT}" ;;
esac
dc() { docker compose -p "$PROJECT" -f docker-compose.deploy.yml --env-file .env --profile backup "$@"; }
envval() { sed -n "s/^$1=//p" .env | tail -n1 | sed 's/^"\(.*\)"$/\1/'; }
# restic runs in a throwaway copy of the backup service: same repository, password and mounts.
restic_sh() { dc run --rm --no-deps -T --entrypoint sh "$@"; }
# --retry-lock: the stack's backup service may be running its daily backup/prune right now.
RESTIC_PREP='set -eu -o pipefail; apk add -q --no-cache restic >/dev/null;
  restic() { command restic --retry-lock 15m "$@"; };'

[ -n "$(envval BACKUP_RESTIC_REPOSITORY)" ] || { echo "BACKUP_RESTIC_REPOSITORY is not set in .env." >&2; exit 1; }

resolve_snapshot() {  # $1 = id or "latest", $2 = tag; prints the concrete short id
  local filter="$1"; [ "$1" = latest ] && filter="--latest 1 --tag $2"
  local id
  id=$(restic_sh backup -c "$RESTIC_PREP restic snapshots --json $filter" \
    | grep -o '"short_id":"[0-9a-f]*"' | tail -n1 | cut -d'"' -f4) || true
  [ -n "$id" ] || { echo "No snapshot '$1' (tag $2) found; see ./restore-backup.sh list" >&2; exit 1; }
  echo "$id"
}

confirm() {
  [ "${YES:-}" = 1 ] && return 0
  printf '%s\nType the project name (%s) to continue: ' "$1" "$PROJECT"
  read -r answer
  [ "$answer" = "$PROJECT" ] || { echo "Aborted."; exit 1; }
}

cmd_list() {
  restic_sh backup -c "$RESTIC_PREP restic snapshots"
  echo "Times are UTC. Pick the newest snapshot from BEFORE the data was lost."
}

recreate_db() { dc exec -T db sh -c 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'; }
load_file() { dc exec -T db sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB" >/dev/null' < "$1"; }
finish() {  # the loaded state may be from an older release
  echo "4/5 Migrating the database to the running release"
  dc run --rm migrate
  echo "5/5 Starting the stack"
  dc up -d
}

cmd_db() {
  local snap; snap=$(resolve_snapshot "$1" db)
  confirm "This replaces the WHOLE $PROJECT database with snapshot $snap. Everything changed since then is lost (but saved first; see 'undo')."
  local safety
  safety="restore-safety/db-before-restore-$(date -u +%Y%m%d-%H%M%S).sql"
  mkdir -p restore-safety && chmod 700 restore-safety

  echo "1/5 Stopping backend, retention-cron and backup"
  dc stop backend retention-cron backup

  echo "2/5 Saving the current state: $safety and restic snapshot 'pre-restore'"
  dc exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" --no-owner "$POSTGRES_DB"' > "$safety"
  chmod 600 "$safety"
  restic_sh backup -c "$RESTIC_PREP restic backup --quiet --tag pre-restore --stdin-filename examance.sql --stdin-from-command -- pg_dump --no-owner" \
    || { echo "Off-site pre-restore snapshot failed; aborting before anything changed." >&2; dc up -d; exit 1; }

  echo "3/5 Restoring snapshot $snap"
  recreate_db
  if ! restic_sh backup -c "$RESTIC_PREP restic dump $snap examance.sql | psql -q -v ON_ERROR_STOP=1 >/dev/null"; then
    echo "Restore FAILED. Putting the previous state back from $safety" >&2
    recreate_db && load_file "$safety"
    dc up -d
    echo "Previous state restored; nothing changed." >&2
    exit 1
  fi

  finish
  echo "Done. To go back: ./restore-backup.sh undo (uses $safety; plaintext data, delete once sure)."
}

cmd_undo() {
  local safety
  safety=$(ls -1 restore-safety/db-before-restore-*.sql 2>/dev/null | tail -n1)
  [ -n "$safety" ] || { echo "No safety dump in restore-safety/." >&2; exit 1; }
  confirm "This replaces the WHOLE $PROJECT database with $safety (the state before the last restore)."
  dc stop backend retention-cron backup
  recreate_db
  load_file "$safety"
  finish
  echo "Done: back to the state of $safety."
}

cmd_scans() {
  local snap host_dir
  snap=$(resolve_snapshot "$1" blobs)
  host_dir=$(envval BLOB_STORAGE_HOST_DIR)
  [ -n "$host_dir" ] && [ -f "$host_dir/.examance-blobstore" ] \
    || { echo "BLOB_STORAGE_HOST_DIR is unset or not a marked blob store (mount down?)." >&2; exit 1; }
  confirm "This copies scan files from snapshot $snap into $host_dir. Existing files are never overwritten."
  # Restored and copied inside the container, file by file (busybox cp -n skips whole existing
  # dirs): existing files are never touched, new ones keep the snapshot's owner (uid 10001).
  restic_sh -v "$host_dir:/target" backup -c "$RESTIC_PREP
    restic restore $snap --target /tmp/r --include /data/blobs/scans >/dev/null
    [ -d /tmp/r/data/blobs/scans ] || { echo 'Snapshot holds no scans.'; exit 0; }
    cd /tmp/r/data/blobs/scans
    find . -type f | while read -r f; do
      [ -e \"/target/scans/\$f\" ] && continue
      d=\$(dirname \"/target/scans/\$f\")
      [ -d \"\$d\" ] || { mkdir -p \"\$d\"; chown 10001:10001 \"\$d\" 2>/dev/null || true; }
      cp -a \"\$f\" \"/target/scans/\$f\" && echo copied
    done | wc -l | sed 's/^/Done: /; s/\$/ scan file(s) copied back./'"
  echo "Files no database row references are removed by the next retention run."
}

case "${1:-}" in
  list) cmd_list ;;
  undo) [ "${2:-}" = --yes ] && YES=1; cmd_undo ;;
  db|scans)
    [ -n "${2:-}" ] || { echo "Usage: $0 $1 <snapshot-id|latest> [--yes]" >&2; exit 1; }
    [ "${3:-}" = --yes ] && YES=1
    "cmd_$1" "$2" ;;
  *) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
