#!/bin/sh
# Runs on the deploy host: announces the deployment window and prints MAINTENANCE_REVISION=<n>; no revision only when there is legitimately no window (docs/dev/maintenance_mode.md, issue #285).
# Usage: maintenance-announce.sh <stack dir> <compose project> <lead seconds> <second warning seconds>
# Exit 0 with a revision, or with "No stack yet."/"No maintenance CLI" and none; exit 1 on a busy window or any CLI failure, so the deploy never migrates without freeze and backup by accident.
set -eu

DIR=$1
PROJECT=$2
LEAD=$3
SECOND=$4

no_window() {
  echo "$1"
  exit 0
}

# Never deployed: the deploy step writes the compose file, and no container of the project exists before the first `up`.
cd "$DIR" 2>/dev/null || no_window "No stack yet."
[ -f docker-compose.deploy.yml ] || no_window "No stack yet."
COMPOSE="docker compose -p $PROJECT -f docker-compose.deploy.yml --env-file .env"
# A failing `ps` (daemon down, broken .env) is an error, not "no stack": only a clean empty answer counts.
CONTAINERS=$($COMPOSE ps -aq) || { echo "ERROR: cannot list the stack's containers; aborting before any migration." >&2; exit 1; }
[ -n "$CONTAINERS" ] || no_window "No stack yet."

ARGS="maintenance start --kind deployment --lead-seconds $LEAD --second-warning-seconds $SECOND --class very_short"
RUNNING="$COMPOSE exec -T backend python -m app.cli"
# A fresh container of the same image: survives a restarting or crashed backend container.
FRESH="$COMPOSE --profile tools run --rm --no-deps -T migrate python -m app.cli"

RC=0
OUT=""
announce() {
  RC=0
  OUT=$($1 $ARGS --wait-free 1500 2>&1) || RC=$?
  # An image older than --wait-free: announce without waiting.
  if [ "$RC" != 0 ] && printf '%s\n' "$OUT" | grep -q "No such option"; then
    RC=0
    OUT=$($1 $ARGS 2>&1) || RC=$?
  fi
}

check_busy_or_missing() {
  if [ "$RC" = 75 ]; then
    printf '%s\n' "$OUT" >&2
    echo "MAINTENANCE_BUSY=1"
    exit 1
  fi
  # An image from before the maintenance CLI: deploy as before.
  if [ "$RC" != 0 ] && printf '%s\n' "$OUT" | grep -q "No such command"; then
    printf '%s\n' "$OUT" >&2
    no_window "No maintenance CLI in the running image."
  fi
}

announce "$RUNNING"
check_busy_or_missing
if [ "$RC" != 0 ]; then
  printf '%s\n' "$OUT" >&2
  echo "WARNING: the running backend's CLI failed (exit $RC); retrying in a fresh container." >&2
  announce "$FRESH"
  check_busy_or_missing
fi
if [ "$RC" != 0 ]; then
  printf '%s\n' "$OUT" >&2
  echo "ERROR: could not announce the maintenance window (exit $RC); aborting before any migration." >&2
  exit 1
fi

REV=$(printf '%s\n' "$OUT" | tail -n1)
case "$REV" in
  '' | *[!0-9]*)
    printf '%s\n' "$OUT" >&2
    echo "ERROR: the maintenance CLI printed no revision; aborting before any migration." >&2
    exit 1
    ;;
  *) ;;
esac
echo "MAINTENANCE_REVISION=$REV"
