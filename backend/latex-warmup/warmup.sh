#!/bin/sh
# Fills Tectonic's cache (TECTONIC_CACHE_DIR) with what the exam template needs (issue #75).
# Runs at image build and after each deploy; no timeout, since a cold cache fetches hundreds of
# files one by one. Usage: warmup.sh [assets-dir]
set -eu

here=$(cd "$(dirname "$0")" && pwd)
assets=${1:-"$here/../latex-assets"}
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

cp -R "$assets"/. "$work"/
cp "$here/warmup.tex" "$work/main.tex"
cd "$work"
# Two passes, like every compile: the second reads the .aux (scores) and pulls what it needs.
tectonic --untrusted -k main.tex --keep-logs
tectonic --untrusted -k main.tex --keep-logs
test -s main.pdf
echo "Tectonic cache warm: ${TECTONIC_CACHE_DIR:-default location}"
