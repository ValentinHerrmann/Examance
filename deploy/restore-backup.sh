#!/usr/bin/env bash
# Restore this stack from its restic backup (docs/dev/storage_partitions.md, issue #114).
# Shipped by the deploy workflows next to docker-compose.deploy.yml and .env; run it from there.
#
#   ./restore-backup.sh list                 snapshots of the database and of the scan files
#   ./restore-backup.sh db <id|latest>       replace the WHOLE database with that snapshot
#   ./restore-backup.sh undo                 go back to the state just before the last `db` restore
#   ./restore-backup.sh scans                copy back the scan files the database needs but are missing,
#                                            searching every backup snapshot
#   ./restore-backup.sh scans <id|latest>    copy back every scan file of that snapshot missing on disk
#   ./restore-backup.sh maintenance [latest|<file>|<id>]
#                                            replace the WHOLE database with a maintenance backup (the
#                                            one taken before an update or a manual maintenance, issue #130)
#   ./restore-backup.sh trash list <db-id|latest> [teacher-email]
#                                            trash entries (issue #125) that snapshot held, also those
#                                            the app already erased after its 7 days
#   ./restore-backup.sh trash restore <db-id|latest> <entry-id>... [--blobs <blobs-id|latest>]
#                                            copy those entries back into the live trash (the teacher
#                                            then restores them in the app); --blobs also copies their
#                                            scan files back. Touches no other data, the stack keeps running.
#
# Scans deleted in the app lost their DATABASE ROWS; their files may still be on disk. `scans` cannot
# bring those back; within 7 days the teacher's trash can, later `trash restore` or `db` (see
# docs/backup_and_restore.md).
#
# Before loading a snapshot, `db` saves the current state twice: as a restic snapshot tagged
# `pre-restore` (off-site, listed by `list`, restorable with `db <id>`; never picked by `latest`)
# and as a local file for `undo`. A failed restore puts that state back at once.
# Add --yes to skip the confirmation prompt.
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"
[[ -f .env && -f docker-compose.deploy.yml ]] \
  || { echo "Run this next to .env and docker-compose.deploy.yml." >&2; exit 1; }

case "$(basename "$PWD")" in
  prod) PROJECT=examance-prod ;;
  preview) PROJECT=examance-preview ;;
  *) PROJECT="${EXAMANCE_PROJECT:?not in a prod/preview dir: set EXAMANCE_PROJECT}" ;;
esac
dc() { docker compose -p "$PROJECT" -f docker-compose.deploy.yml --env-file .env --profile backup "$@"; }
envval() { local key="$1"; sed -n "s/^$key=//p" .env | tail -n1 | sed 's/^"\(.*\)"$/\1/'; }
# restic runs in a throwaway copy of the backup service: same repository, password and mounts.
restic_sh() { dc run --rm --no-deps -T --entrypoint sh "$@"; }
# --retry-lock: the stack's backup service may be running its daily backup/prune right now.
RESTIC_PREP='set -eu -o pipefail; apk add -q --no-cache restic >/dev/null;
  restic() { command restic --retry-lock 15m "$@"; };'

# Only the restic commands need it: a local maintenance backup restores without restic.
need_restic() {
  [[ -n "$(envval BACKUP_RESTIC_REPOSITORY)" ]] || { echo "BACKUP_RESTIC_REPOSITORY is not set in .env." >&2; exit 1; }
}

resolve_snapshot() {  # $1 = id or "latest", $2 = tag; prints the concrete short id
  local wanted="$1" tag="$2"
  [[ -n "$wanted" ]] || { echo "No snapshot given; see ./restore-backup.sh list" >&2; exit 1; }
  local filter="$wanted"; [[ "$wanted" = latest ]] && filter="--latest 1 --tag $tag"
  local id
  id=$(restic_sh backup -c "$RESTIC_PREP restic snapshots --json $filter" \
    | grep -o '"short_id":"[0-9a-f]*"' | tail -n1 | cut -d'"' -f4) || true
  [[ -n "$id" ]] || { echo "No snapshot '$wanted' (tag $tag) found; see ./restore-backup.sh list" >&2; exit 1; }
  echo "$id"
}

confirm() {
  [[ "${YES:-}" = 1 ]] && return 0
  printf '%s\nType the project name (%s) to continue: ' "$1" "$PROJECT"
  read -r answer
  [[ "$answer" = "$PROJECT" ]] || { echo "Aborted."; exit 1; }
}

cmd_list() {
  if [[ -n "$(envval BACKUP_RESTIC_REPOSITORY)" ]]; then
    restic_sh backup -c "$RESTIC_PREP restic snapshots"
    echo "Times are UTC. Pick the newest snapshot from BEFORE the data was lost."
  fi
  ls -1 maintenance-backups/*.sql 2>/dev/null | sed 's/^/local maintenance backup: /' || true
}

recreate_db() { dc exec -T db sh -c 'dropdb -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'; }
load_file() { local file="$1"; dc exec -T db sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" "$POSTGRES_DB" >/dev/null' < "$file"; }
finish() {  # the loaded state may be from an older release
  echo "4/5 Migrating the database to the running release"
  dc run --rm migrate
  # A maintenance backup holds its own open window; restored as is, it would lock everyone out.
  dc exec -T db sh -c 'psql -q -U "$POSTGRES_USER" "$POSTGRES_DB" -c "UPDATE maintenance_window SET ended_at = now() WHERE ended_at IS NULL"' >/dev/null 2>&1 || true
  echo "5/5 Starting the stack"
  dc up -d
}

cmd_db() {
  need_restic
  local snap; snap=$(resolve_snapshot "$1" db)
  confirm "This replaces the WHOLE $PROJECT database with snapshot $snap. Everything changed since then is lost (but saved first; see 'undo')."
  local safety
  safety="restore-safety/db-before-restore-$(date -u +%Y%m%d-%H%M%S).sql"
  mkdir -p restore-safety && chmod 700 restore-safety

  echo "1/5 Stopping backend, retention-cron and the backup services"
  dc stop backend retention-cron backup maintenance-backup

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
  [[ -n "$safety" ]] || { echo "No safety dump in restore-safety/." >&2; exit 1; }
  confirm "This replaces the WHOLE $PROJECT database with $safety (the state before the last restore)."
  dc stop backend retention-cron backup maintenance-backup
  recreate_db
  load_file "$safety"
  finish
  echo "Done: back to the state of $safety."
}

# A local file from maintenance-backups/ (no restic needed), else a restic snapshot via `db`.
cmd_maintenance() {
  local wanted="${1:-latest}" file=""
  if [[ "$wanted" = latest ]]; then
    file=$(ls -1t maintenance-backups/*.sql 2>/dev/null | head -n1) || true
    if [[ -z "$file" ]]; then
      need_restic
      local id; id=$(resolve_snapshot latest maintenance)
      cmd_db "$id"
      return
    fi
  elif [[ -f "$wanted" ]]; then
    file="$wanted"
  elif [[ -f "maintenance-backups/$wanted" ]]; then
    file="maintenance-backups/$wanted"
  else
    cmd_db "$wanted"
    return
  fi
  confirm "This replaces the WHOLE $PROJECT database with $file. Everything changed since then is lost (but saved first; see 'undo'). If the update's own migration caused the problem, roll the backend image back first: the restore migrates to the running release."
  local safety
  safety="restore-safety/db-before-restore-$(date -u +%Y%m%d-%H%M%S).sql"
  mkdir -p restore-safety && chmod 700 restore-safety

  echo "1/5 Stopping backend, retention-cron and the backup services"
  dc stop backend retention-cron backup maintenance-backup

  echo "2/5 Saving the current state: $safety"
  dc exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" --no-owner "$POSTGRES_DB"' > "$safety"
  chmod 600 "$safety"

  echo "3/5 Restoring $file"
  recreate_db
  if ! load_file "$file"; then
    echo "Restore FAILED. Putting the previous state back from $safety" >&2
    recreate_db && load_file "$safety"
    dc up -d
    echo "Previous state restored; nothing changed." >&2
    exit 1
  fi

  finish
  echo "Done. To go back: ./restore-backup.sh undo (uses $safety; plaintext data, delete once sure)."
}

# Runs inside the throwaway backup container. /target = the blob dir, /work/refs = scan_path of every
# row; SNAP set = copy that snapshot's missing files (with ONLY set: just the missing referenced ones),
# unset = find the missing referenced files.
# File by file on purpose: busybox `cp -n` skips whole existing dirs. Existing files are never touched.
SCANS_SH='
cd /work; : > missing; : > copied; : > present
while read -r ref; do [ -e "/target/$ref" ] || echo "$ref" >> missing; done < refs
copy_tree() {  # $1 = snapshot id; copies what /tmp/r holds into /target
  [ -d /tmp/r/data/blobs/scans ] || return 0
  (cd /tmp/r/data/blobs && find scans -type f) | while read -r f; do
    if [ -e "/target/$f" ]; then echo "$f" >> present; continue; fi
    d=$(dirname "/target/$f")
    [ -d "$d" ] || { mkdir -p "$d"; chown 10001:10001 "$d" 2>/dev/null || true; }
    cp -a "/tmp/r/data/blobs/$f" "/target/$f" && echo "$f (from $1)" >> copied
  done
}
recount_missing() { : > still; while read -r ref; do [ -e "/target/$ref" ] || echo "$ref" >> still; done < missing; mv still missing; }
echo "$(wc -l < refs) scan file(s) referenced by the database, $(wc -l < missing) of them missing on disk."
if [ -n "${SNAP:-}" ]; then
  if [ -n "${ONLY:-}" ]; then
    if [ -s missing ]; then
      set --; while read -r ref; do set -- "$@" --include "/data/blobs/$ref"; done < missing
      restic restore "$SNAP" --target /tmp/r "$@" >/dev/null
    fi
  else
    restic restore "$SNAP" --target /tmp/r --include /data/blobs/scans >/dev/null
  fi
  total=$(find /tmp/r/data/blobs/scans -type f 2>/dev/null | wc -l)
  copy_tree "$SNAP"
  echo "Snapshot $SNAP holds $total scan file(s): $(wc -l < present) already on disk, $(wc -l < copied) copied back."
  [ "$total" -gt 0 ] || echo "  It holds no scans at all: was the blob dir mounted when that backup ran?"
  recount_missing
else
  for id in $(restic snapshots --tag blobs --json | grep -o "\"short_id\":\"[0-9a-f]*\"" | cut -d\" -f4 | sed "1!G;h;\$!d"); do
    [ -s missing ] || break
    set --; while read -r ref; do set -- "$@" --include "/data/blobs/$ref"; done < missing
    rm -rf /tmp/r; restic restore "$id" --target /tmp/r "$@" >/dev/null
    copy_tree "$id"; recount_missing
  done
  echo "Copied back: $(wc -l < copied)"
fi
sed "s/^/  restored /" copied
if [ -s missing ]; then
  echo "Still missing (no snapshot has them; the database rows exist, so the app shows an error for these):"
  sed "s/^/  /" missing
elif [ -n "${ONLY:-}" ]; then
  [ -s copied ] || echo "Every scan file of the restored entries is already on disk."
elif [ ! -s copied ]; then
  echo "Every scan file the database references is on disk, so nothing needed restoring."
  # A loop, not grep -vxFf: busybox treats an empty pattern file as "matches everything".
  orphans=$(cd /target && find scans -type f 2>/dev/null | while read -r f; do grep -qxF "$f" /work/refs || echo; done | wc -l)
  [ "$orphans" -eq 0 ] || echo "$orphans file(s) on disk belong to no database row: deleted in the app, not lost."
  echo "Scans deleted in the app (e.g. \"delete all submissions\") lost their DATABASE ROWS; copying files"
  echo "cannot bring them back. Use ./restore-backup.sh db <id> (affects every account), see"
  echo "docs/backup_and_restore.md."
fi
'

cmd_scans() {  # $1 = snapshot id, "latest" or empty
  need_restic
  local wanted="$1" snap="" host_dir
  [[ -n "$wanted" ]] && snap=$(resolve_snapshot "$wanted" blobs)
  host_dir=$(envval BLOB_STORAGE_HOST_DIR)
  [[ -n "$host_dir" && -f "$host_dir/.examance-blobstore" ]] \
    || { echo "BLOB_STORAGE_HOST_DIR is unset or not a marked blob store (mount down?)." >&2; exit 1; }
  if [[ -n "$snap" ]]; then
    confirm "This copies every scan file of snapshot $snap that is missing on disk into $host_dir. Existing files are never overwritten."
  else
    confirm "This copies the scan files the database references but are missing on disk into $host_dir, from whichever snapshot holds them. Existing files are never overwritten."
  fi
  work=$(mktemp -d "$PWD/restore-scans.XXXXXX")
  trap 'rm -rf "${work:-}"' EXIT  # global on purpose: a function-local is gone when the trap runs
  dc exec -T db sh -c 'psql -U "$POSTGRES_USER" "$POSTGRES_DB" -Atc "select scan_path from scan_submissions where scan_path is not null union select json_array_elements_text(blob_refs) from trash_items"' > "$work/refs"
  restic_sh -v "$host_dir:/target" -v "$work:/work" -e "SNAP=$snap" backup -c "$RESTIC_PREP $SCANS_SH"
  echo "Files no database row references are removed again by the next retention run."
}

# Trash entries (issue #125) out of a `db` snapshot. Runs in the throwaway backup container (PG* env,
# restic): the snapshot's plain-SQL `COPY public.trash_items` block is loaded into a TEMP table of the
# live database (gone with the session), then listed or inserted. No awk early exit: pipefail would
# turn the SIGPIPE into a failure. Env: SNAP, MODE (list|restore), IDS (comma list), EMAIL, GRACE.
TRASH_SH=
IFS= read -r -d '' TRASH_SH <<'EOF' || true
cd /tmp
restic dump "$SNAP" examance.sql \
  | awk '/^COPY public\.trash_items \(/ {p=1} p {print} p && $0 == "\\." {p=0}' > block.sql
if [ ! -s block.sql ]; then
  echo "Snapshot $SNAP holds no trash_items table: it was taken before the trash existed (issue #125)." >&2
  exit 1
fi
sed 's/^COPY public\.trash_items /COPY trash_restore /' block.sql > load.sql
if [ "$MODE" = list ]; then
  cat > query.sql <<'SQL'
select r.id, coalesce(t.email, '(account gone)') as teacher, r.kind,
       coalesce(r.label->>'exam_title', r.label->>'exercise_name', '') as label,
       to_char(r.deleted_at at time zone 'UTC', 'YYYY-MM-DD HH24:MI') as deleted_utc,
       left(r.group_id::text, 8) as group_id,
       case when exists (select 1 from trash_items l where l.id = r.id) then 'yes' else '' end as in_trash_now
from trash_restore r left join teachers t on t.id = r.teacher_id
where :'email' = '' or lower(t.email) = lower(:'email')
order by r.deleted_at desc;
SQL
else
  # Only teachers that still exist (the FK would refuse the rest); an entry already in the trash stays untouched.
  cat > query.sql <<'SQL'
with ins as (
  insert into trash_items (id, teacher_id, group_id, kind, exam_id, label, payload, blob_refs, deleted_at, purge_after)
  select r.id, r.teacher_id, r.group_id, r.kind, r.exam_id, r.label, r.payload, r.blob_refs, r.deleted_at,
         now() + make_interval(days => :grace)
  from trash_restore r join teachers t on t.id = r.teacher_id
  where r.id::text = any(string_to_array(:'ids', ','))
  on conflict (id) do nothing
  returning id, teacher_id, kind, blob_refs
)
select 'entry', ins.id::text, te.email, ins.kind from ins join teachers te on te.id = ins.teacher_id
union all
select 'ref', ref.v, '', '' from ins cross join lateral json_array_elements_text(ins.blob_refs) as ref(v);
SQL
fi
{ echo 'create temp table trash_restore (like trash_items);'; cat load.sql; cat query.sql; } \
  | psql -q -v ON_ERROR_STOP=1 -v email="$EMAIL" -v ids="$IDS" -v grace="$GRACE" \
      $( [ "$MODE" = list ] || echo -At -F '|' )
EOF

cmd_trash_list() {  # $1 = db snapshot id or "latest", $2 = teacher e-mail (optional)
  need_restic
  local snap; snap=$(resolve_snapshot "${1:-}" db)
  echo "Trash entries in snapshot $snap (times UTC; in_trash_now = still in the live trash):"
  restic_sh -e "SNAP=$snap" -e MODE=list -e "EMAIL=${2:-}" -e IDS= -e GRACE=7 backup -c "$RESTIC_PREP $TRASH_SH"
  echo "Bring entries back with: ./restore-backup.sh trash restore $snap <entry-id>..."
}

cmd_trash_restore() {  # <db snapshot|latest> <entry-id>... [--blobs <blobs snapshot|latest>]
  need_restic
  local wanted="" blobs="" ids=() arg
  while [[ $# -gt 0 ]]; do
    arg="$1"; shift
    case "$arg" in
      --yes) YES=1 ;;
      --blobs) blobs="${1:-}"; [[ -n "$blobs" ]] || { echo "--blobs needs a snapshot id or latest." >&2; exit 1; }; shift ;;
      *) if [[ -z "$wanted" ]]; then wanted="$arg"
         elif [[ "$arg" =~ ^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$ ]]; then ids+=("${arg,,}")
         else echo "Not an entry id: $arg (see ./restore-backup.sh trash list)" >&2; exit 1; fi ;;
    esac
  done
  [[ -n "$wanted" && ${#ids[@]} -gt 0 ]] \
    || { echo "Usage: $0 trash restore <db-snapshot-id|latest> <entry-id>... [--blobs <blobs-snapshot-id|latest>] [--yes]" >&2; exit 1; }
  local snap blobs_snap="" host_dir="" grace
  snap=$(resolve_snapshot "$wanted" db)
  if [[ -n "$blobs" ]]; then
    blobs_snap=$(resolve_snapshot "$blobs" blobs)
    host_dir=$(envval BLOB_STORAGE_HOST_DIR)
    [[ -n "$host_dir" && -f "$host_dir/.examance-blobstore" ]] \
      || { echo "BLOB_STORAGE_HOST_DIR is unset or not a marked blob store (mount down?)." >&2; exit 1; }
  fi
  grace=$(envval RETENTION_GRACE_DAYS); [[ "$grace" =~ ^[0-9]+$ ]] || grace=7
  confirm "This copies ${#ids[@]} trash entry(ies) from snapshot $snap into the live trash of $PROJECT for $grace days${blobs_snap:+, and their scan files from blobs snapshot $blobs_snap}. Nothing else changes; entries already in the trash stay as they are."

  local ids_csv out
  ids_csv=$(IFS=,; echo "${ids[*]}")
  out=$(restic_sh -e "SNAP=$snap" -e MODE=restore -e "IDS=$ids_csv" -e EMAIL= -e "GRACE=$grace" backup -c "$RESTIC_PREP $TRASH_SH")
  local done_ids; done_ids=$(sed -n 's/^entry|\([^|]*\)|.*/\1/p' <<<"$out")
  if [[ -z "$done_ids" ]]; then
    echo "Nothing restored: none of the ids is in snapshot $snap, their account no longer exists, or they are in the trash already." >&2
    exit 1
  fi
  echo "Copied back into the trash (the teacher restores them under Trash in the app, within $grace days):"
  sed -n 's/^entry|\([^|]*\)|\([^|]*\)|\(.*\)$/  \1  \3  (\2)/p' <<<"$out"
  local id
  for id in "${ids[@]}"; do grep -qxF "$id" <<<"$done_ids" || echo "  not restored: $id" >&2; done

  local refs; refs=$(sed -n 's/^ref|\([^|]*\)|.*/\1/p' <<<"$out")
  if [[ -n "$blobs_snap" && -n "$refs" ]]; then
    work=$(mktemp -d "$PWD/restore-scans.XXXXXX")
    trap 'rm -rf "${work:-}"' EXIT
    printf '%s\n' "$refs" > "$work/refs"
    restic_sh -v "$host_dir:/target" -v "$work:/work" -e "SNAP=$blobs_snap" -e ONLY=1 backup -c "$RESTIC_PREP $SCANS_SH"
  elif [[ -n "$refs" ]]; then
    echo "The entries point at $(wc -l <<<"$refs") scan file(s). If the files are gone from disk, run again with --blobs <blobs-snapshot-id|latest>."
  fi
}

case "${1:-}" in
  list) cmd_list ;;
  undo) [[ "${2:-}" = --yes ]] && YES=1; cmd_undo ;;
  db)
    [[ -n "${2:-}" && "$2" != --yes ]] || { echo "Usage: $0 db <snapshot-id|latest> [--yes]" >&2; exit 1; }
    [[ "${3:-}" = --yes ]] && YES=1
    cmd_db "$2" ;;
  maintenance)
    arg="${2:-latest}"; [[ "$arg" = --yes ]] && { YES=1; arg=latest; }
    [[ "${3:-}" = --yes ]] && YES=1
    cmd_maintenance "$arg" ;;
  trash)
    shift; sub="${1:-}"; shift || true
    case "$sub" in
      list) cmd_trash_list "$@" ;;
      restore) cmd_trash_restore "$@" ;;
      *) sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
    esac ;;
  scans)
    arg="${2:-}"; [[ "$arg" = --yes ]] && { YES=1; arg=""; }
    [[ "${3:-}" = --yes ]] && YES=1
    cmd_scans "$arg" ;;
  *) sed -n '2,29p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
