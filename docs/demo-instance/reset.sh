#!/usr/bin/env bash
# Drop and recreate the demo database, migrate, and create the demo accounts.
# Assumes the dev stack from setup.sh (local PostgreSQL user/db "blindgrade"). Destroys all data in it.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
PGPASSWORD=blindgrade psql -h localhost -U blindgrade -d postgres -q -c 'DROP DATABASE IF EXISTS blindgrade WITH (FORCE);' -c 'CREATE DATABASE blindgrade;'
redis-cli flushall >/dev/null || true
rm -rf "$HERE/.state"
cd "$ROOT/backend"
. .venv/bin/activate
alembic upgrade head >/dev/null
python "$HERE/accounts.py"
