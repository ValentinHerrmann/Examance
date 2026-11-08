#!/usr/bin/env python3
"""Count non-blank lines per area of the tracked files and write shields.io endpoint JSON (README badges)."""
import json
import re
import subprocess
import sys
from pathlib import Path

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "badges-out")

# Generated, vendored or binary-ish files never count.
SKIP = re.compile(
    r"(^|/)(package-lock\.json|uv\.lock|openapi\.json)$"
    r"|^frontend/static/(core|example-data)/|^latex-sample-project/|^docs/screenshots/"
    r"|^docs/\.vitepress/(cache|dist)/|\.(png|jpe?g|gif|svg|webp|ico|pdf|woff2?|ttf|wasm|zip|gz|data|map)$"
)
CODE_EXT = r"\.(py|ts|js|svelte|css|html|sql|sh|yml|yaml|toml|mjs|cjs)$"
TEST = re.compile(r"^(backend/tests|frontend/tests|frontend/e2e)/|\.(test|spec)\.(ts|js)$")

# First matching bucket wins, so order matters.
BUCKETS = [
    ("tests", lambda p: TEST.search(p) and re.search(CODE_EXT, p)),
    ("docs", lambda p: p.endswith(".md")),
    ("frontend", lambda p: p.startswith("frontend/") and re.search(CODE_EXT, p)),
    ("backend", lambda p: p.startswith("backend/") and re.search(CODE_EXT + r"|\.tex$|\.sty$|\.cls$", p)),
]


def lines(path: str) -> int:
    try:
        with open(path, "rb") as f:
            return sum(1 for ln in f if ln.strip())
    except OSError:
        return 0


def main() -> None:
    files = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True).stdout.splitlines()
    totals = {name: 0 for name, _ in BUCKETS}
    for p in files:
        if SKIP.search(p):
            continue
        for name, match in BUCKETS:
            if match(p):
                totals[name] += lines(p)
                break
    totals["total"] = sum(totals.values())

    def fmt(n: int) -> str:
        return f"{n / 1000:.1f}k" if n >= 1000 else str(n)

    meta = {
        "frontend": ("Frontend", "svelte", "FF3E00"),
        "backend": ("Backend", "fastapi", "009688"),
        "tests": ("Tests", "vitest", "6DA13F"),
        "docs": ("Docs", "readthedocs", "3B82F6"),
        "total": ("Total", "github", "6E40C9"),
    }
    OUT.mkdir(parents=True, exist_ok=True)
    for key, (label, logo, color) in meta.items():
        (OUT / f"{key}.json").write_text(json.dumps({
            "schemaVersion": 1, "label": label, "message": f"{fmt(totals[key])} lines",
            "color": color, "namedLogo": logo, "logoColor": "white",
        }))
    (OUT / "stats.json").write_text(json.dumps(totals, indent=2))
    print(json.dumps(totals))


if __name__ == "__main__":
    main()
