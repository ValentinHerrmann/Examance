#!/usr/bin/env bash
# Rebuild the Examance demo instance from scratch and capture the pitch screenshots.
# Prerequisites: local PostgreSQL (user/db "blindgrade"), Redis, backend venv (make install),
# frontend deps (make install-frontend) incl. the BusyTeX assets, backend on :8000, Vite on :4173.
# See README.md. Destroys all data in the local "blindgrade" database.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
PY="${DEMO_PYTHON:-python3}"   # needs pymupdf, pillow, qrcode, numpy
cd "$HERE"

[ "${1:-}" = "--keep" ] || ./reset.sh
mkdir -p .state/fonts
for f in caveat/Caveat%5Bwght%5D.ttf kalam/Kalam-Regular.ttf patrickhand/PatrickHand-Regular.ttf indieflower/IndieFlower-Regular.ttf; do
  out=".state/fonts/$(basename "$f" | sed 's/%5B.*/.ttf/')"
  [ -f "$out" ] || curl -fsSL -o "$out" "https://raw.githubusercontent.com/google/fonts/main/ofl/$f"
done

node seed-library.mjs          # colleague shares 3 exercises; demo teacher builds 11 + a variant, copies one, proposes a change
node seed-exams.mjs            # 4 exams; 10a/10b compiled in the browser
for k in 10b 10a; do "$PY" -I mkscans.py ".state/exam-$k.pdf" "$k" ".state/scan-$k.pdf" ".state/plan-$k.json"; done
"$PY" -I mkpaper.py .state/paper-9c.tsv
node seed-results.mjs          # scan import, grading of 51 booklets, paper class via Excel paste
node capture.mjs               # dark-theme captures into .state/shots
"$PY" -I assets.py             # crop into docs/screenshots/pitch
