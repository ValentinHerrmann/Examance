#!/bin/sh
# Compiles warmup.tex through the server's runner (services/texrunner.py, issue #341): checks that TeX Live has
# every package the template needs and builds the warm-up's format into LATEX_FORMAT_DIR.
# Runs at image build and after each deploy. Usage: warmup.sh
set -eu

here=$(cd "$(dirname "$0")" && pwd)
cd "$here/.."
python - <<'PY'
import asyncio
import os
import sys
from pathlib import Path

from app.services.texrunner import CompilationError, run_tex

source = Path("latex-warmup/warmup.tex").read_text(encoding="utf-8")
try:
    result = asyncio.run(run_tex(source, {}, time_limit=600))
except CompilationError as exc:
    print(exc.log or exc, file=sys.stderr)
    print(f"LaTeX warm-up failed: {exc}", file=sys.stderr)
    sys.exit(1)
assert result.pdf.startswith(b"%PDF-")
print("LaTeX warm-up compiled; formats in", os.environ.get("LATEX_FORMAT_DIR", "a temp dir"))
PY
