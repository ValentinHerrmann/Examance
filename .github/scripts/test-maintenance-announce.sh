#!/usr/bin/env bash
# Regression tests for maintenance-announce.sh with a stub `docker` (issue #285): only the documented no-window cases may deploy without a revision.
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$HERE/maintenance-announce.sh"
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$WORK/bin"
# Stub: STUB_PS / STUB_PS_RC = `compose ps -aq` output and exit code; STUB_EXEC_* / STUB_RUN_* = exit code and output of the running / fresh CLI; STUB_NO_WAIT_FREE=1 rejects --wait-free.
cat > "$WORK/bin/docker" <<'STUB'
#!/usr/bin/env bash
args=" $* "
if [[ "$args" == *" ps -aq "* ]]; then printf '%s' "${STUB_PS:-}"; exit "${STUB_PS_RC:-0}"; fi
if [[ "${STUB_NO_WAIT_FREE:-}" == 1 && "$args" == *" --wait-free "* ]]; then echo "Error: No such option: --wait-free"; exit 2; fi
if [[ "$args" == *" exec "* ]]; then printf '%b' "${STUB_EXEC_OUT:-}"; exit "${STUB_EXEC_RC:-0}"; fi
if [[ "$args" == *" run "* ]]; then printf '%b' "${STUB_RUN_OUT:-}"; exit "${STUB_RUN_RC:-0}"; fi
echo "unexpected docker call: $*" >&2
exit 99
STUB
chmod +x "$WORK/bin/docker"

STACK="$WORK/stack"
mkdir -p "$STACK"
touch "$STACK/docker-compose.deploy.yml" "$STACK/.env"

fails=0
# expect <name> <expected exit> <expected stdout line or ""> [env assignments…]
expect() {
  local name=$1 want_rc=$2 want_line=$3 dir=${DIR:-$STACK}
  shift 3
  local out rc=0
  out=$(env PATH="$WORK/bin:$PATH" "$@" sh "$SCRIPT" "$dir" examance-test 30 10 2>/dev/null) || rc=$?
  if [[ "$rc" != "$want_rc" ]] || { [[ -n "$want_line" ]] && ! grep -qxF "$want_line" <<<"$out"; } \
    || { [[ -z "$want_line" ]] && grep -q '^MAINTENANCE_REVISION=[0-9]' <<<"$out"; }; then
    echo "FAIL: $name (exit $rc, want $want_rc): $out"
    fails=$((fails + 1))
  else
    echo "ok: $name"
  fi
}

DIR="$WORK/missing" expect "no stack directory" 0 "No stack yet."
mkdir -p "$WORK/bare"
DIR="$WORK/bare" expect "directory without compose file" 0 "No stack yet."
expect "no container of the project" 0 "No stack yet." STUB_PS=""
expect "cannot list containers" 1 "" STUB_PS_RC=1
expect "announced" 0 "MAINTENANCE_REVISION=42" STUB_PS=abc STUB_EXEC_OUT='Window opens in 30 s\n42\n'
expect "other window open" 1 "MAINTENANCE_BUSY=1" STUB_PS=abc STUB_EXEC_RC=75 STUB_EXEC_OUT='busy\n'
expect "image without the maintenance CLI" 0 "No maintenance CLI in the running image." \
  STUB_PS=abc STUB_EXEC_RC=2 STUB_EXEC_OUT="Error: No such command 'maintenance'.\n"
expect "image without --wait-free" 0 "MAINTENANCE_REVISION=7" STUB_PS=abc STUB_NO_WAIT_FREE=1 STUB_EXEC_OUT='7\n'
expect "running CLI fails, fresh container works" 0 "MAINTENANCE_REVISION=43" \
  STUB_PS=abc STUB_EXEC_RC=1 STUB_EXEC_OUT='container is restarting\n' STUB_RUN_OUT='43\n'
expect "fresh container finds another window" 1 "MAINTENANCE_BUSY=1" \
  STUB_PS=abc STUB_EXEC_RC=1 STUB_EXEC_OUT='boom\n' STUB_RUN_RC=75 STUB_RUN_OUT='busy\n'
expect "both CLIs fail" 1 "" STUB_PS=abc STUB_EXEC_RC=1 STUB_EXEC_OUT='boom\n' STUB_RUN_RC=1 STUB_RUN_OUT='database down\n'
expect "no revision printed" 1 "" STUB_PS=abc STUB_EXEC_OUT='something unexpected\n'

if ((fails > 0)); then
  echo "$fails case(s) failed"
  exit 1
fi
