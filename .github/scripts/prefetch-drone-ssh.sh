#!/usr/bin/env bash
# Puts drone-ssh where appleboy/ssh-action looks for it before downloading, so a short GitHub releases outage does not fail the deploy: the action's own download retries for seconds, this one for minutes.
# The action then skips its download ("already exists"). If this fails, the action still tries itself.
set -euo pipefail

# Must match the drone-ssh default of the pinned ssh-action (v1.2.5: 1.8.2); checksum from the release's checksums.txt.
VERSION="1.8.2"
SHA256="1e10a9972eef167d9ddbc39e1ba80f7d44a011b4a6bc4f6149434154d9b6bb24"
BINARY="drone-ssh-${VERSION}-linux-amd64"
URL="https://github.com/appleboy/drone-ssh/releases/download/v${VERSION}/${BINARY}"

# The runner downloads every action of the job before the first step, under <work>/_actions/<owner>/<repo>/<ref>.
ACTIONS_DIR="${RUNNER_WORKSPACE:?}/../_actions/appleboy/ssh-action"
shopt -s nullglob
targets=("$ACTIONS_DIR"/*/)
if ((${#targets[@]} == 0)); then
  echo "No appleboy/ssh-action checkout under $ACTIONS_DIR; nothing to prefetch." >&2
  exit 0
fi

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
"$(dirname "$0")/retry.sh" 8 curl -fsSL --output "$tmp" "$URL"
echo "${SHA256}  ${tmp}" | sha256sum --check --quiet
for dir in "${targets[@]}"; do
  install -m 0755 "$tmp" "${dir%/}/${BINARY}"
done
echo "drone-ssh ${VERSION} ready for ${#targets[@]} ssh-action checkout(s)."
