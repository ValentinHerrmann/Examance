#!/usr/bin/env python3
"""Count lines per area of the tracked files and render a table SVG plus stats.json for the README."""
import json
import re
import subprocess
import sys
from pathlib import Path

OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "badges-out")

# Generated, vendored or binary-ish files never count.
SKIP_LOCKS = re.compile(r"(?:^|/)(?:package-lock\.json|uv\.lock|openapi\.json)$")
SKIP_BINARY = re.compile(r"\.(?:png|jpe?g|gif|svg|webp|ico|pdf|woff2?|ttf|wasm|zip|gz|data|map)$")
SKIP_PREFIXES = ("frontend/static/core/", "frontend/static/example-data/", "latex-sample-project/", "docs/screenshots/",
                 "docs/.vitepress/cache/", "docs/.vitepress/dist/")


def skipped(path: str) -> bool:
    return path.startswith(SKIP_PREFIXES) or bool(SKIP_LOCKS.search(path) or SKIP_BINARY.search(path))


CODE_EXT = r"\.(?:py|ts|js|svelte|css|html|sql|sh|yml|yaml|toml|mjs|cjs)$"
BACKEND_EXT = r"\.(?:py|ts|js|svelte|css|html|sql|sh|yml|yaml|toml|mjs|cjs|tex|sty|cls)$"
TEST_DIRS = ("backend/tests/", "frontend/tests/", "frontend/e2e/")
TEST_FILE = re.compile(r"\.(?:test|spec)\.(?:ts|js)$")


def is_test(path: str) -> bool:
    return path.startswith(TEST_DIRS) or bool(TEST_FILE.search(path))


# First matching area wins, so order matters. (key, label, matcher)
AREAS = [
    ("frontend_tests", "Frontend tests", lambda p: is_test(p) and p.startswith("frontend/") and re.search(CODE_EXT, p)),
    ("backend_tests", "Backend tests", lambda p: is_test(p) and p.startswith("backend/") and re.search(CODE_EXT, p)),
    ("docs", "Documentation", lambda p: p.endswith(".md")),
    ("frontend", "Frontend", lambda p: p.startswith("frontend/") and re.search(CODE_EXT, p)),
    ("backend", "Backend", lambda p: p.startswith("backend/") and re.search(BACKEND_EXT, p)),
]
COLORS = {"frontend": "#FF3E00", "frontend_tests": "#F59E0B", "backend": "#009688", "backend_tests": "#6DA13F", "docs": "#3B82F6"}

SVELTE = ".svelte"
LINE_COMMENT = {".py": "#", ".sh": "#", ".yml": "#", ".yaml": "#", ".toml": "#", ".sql": "--",
                ".ts": "//", ".js": "//", ".mjs": "//", ".cjs": "//", SVELTE: "//"}
C_BLOCK = ("/*", "*/")
HTML_BLOCK = ("<!--", "-->")
BLOCK_COMMENT = {".ts": [C_BLOCK], ".js": [C_BLOCK], ".mjs": [C_BLOCK], ".cjs": [C_BLOCK],
                 ".css": [C_BLOCK], SVELTE: [C_BLOCK, HTML_BLOCK], ".html": [HTML_BLOCK]}


def classify(s: str, ext: str, end: str | None) -> tuple[str, str | None]:
    """Classify one stripped line as blank/comment/code; returns the pending block terminator too."""
    if not s:
        return "blank", end
    if end:
        return "comment", (None if end in s else end)
    for start, stop in BLOCK_COMMENT.get(ext, []):
        if s.startswith(start):
            return "comment", (None if stop in s[len(start):] else stop)
    line_c = LINE_COMMENT.get(ext)
    if line_c and s.startswith(line_c):
        return "comment", None
    return "code", None


def count(path: str) -> tuple[int, int, int]:
    """Return (blank, comment, code) lines; Markdown is all prose, so it counts as code-free."""
    ext = Path(path).suffix
    tally = {"blank": 0, "comment": 0, "code": 0}
    end = None
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for raw in f:
                kind, end = classify(raw.strip(), ext, end)
                tally[kind] += 1
    except OSError:
        pass
    return tally["blank"], tally["comment"], tally["code"]


def fmt(n: int) -> str:
    return f"{n:,}".replace(",", " ")


W, ROW_H, TOP = 820, 38, 64
COLS = {"area": 20, "files": 250, "lines": 335, "code": 435, "comments": 535, "bar": 630}
HEADERS = [("area", "Area"), ("files", "Files"), ("lines", "Lines"), ("code", "Code"), ("comments", "Comments"), ("bar", "Share of code")]
STYLE = (
    '<style>.bg{fill:#fff;stroke:#d0d7de}.hd{fill:#57606a;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}'
    '.tx{fill:#1f2328;font-size:14px}.mu{fill:#57606a;font-size:14px}.tt{fill:#1f2328;font-size:14px;font-weight:700}.ln{stroke:#d0d7de}'
    '.ti{fill:#1f2328;font-size:17px;font-weight:700}.tr{fill:#eaeef2}'
    '@media (prefers-color-scheme:dark){.bg{fill:#0d1117;stroke:#30363d}.hd,.mu{fill:#8b949e}.tx,.tt,.ti{fill:#e6edf3}.ln{stroke:#30363d}.tr{fill:#21262d}}</style>'
)


def hline(y: float) -> str:
    return f'<line class="ln" x1="20" x2="{W - 20}" y1="{y}" y2="{y}"/>'


def header_svg(total: dict) -> list[str]:
    out = ['<text class="ti" x="20" y="30">Code statistics</text>',
           f'<text class="mu" x="{W - 20}" y="30" text-anchor="end" style="font-size:12px">{total["files"]} files · updated automatically</text>']
    for key, label in HEADERS:
        start = key in ("area", "bar")
        x = COLS[key] if start else COLS[key] + 60
        out.append(f'<text class="hd" x="{x}" y="{TOP - 10}" text-anchor="{"start" if start else "end"}">{label}</text>')
    out.append(hline(TOP))
    return out


def row_svg(r: dict, y: float, totcode: int) -> list[str]:
    cy = y + ROW_H / 2 + 5
    out = [f'<circle cx="28" cy="{cy - 5}" r="5" fill="{r["color"]}"/>', f'<text class="tx" x="42" y="{cy}">{r["label"]}</text>']
    for key in ("files", "lines", "code", "comments"):
        txt = "–" if r[key] is None else fmt(r[key])
        out.append(f'<text class="{"tx" if key == "code" else "mu"}" x="{COLS[key] + 60}" y="{cy}" text-anchor="end">{txt}</text>')
    if r["code"]:
        bw = max(3, 160 * r["code"] / totcode)
        out.append(f'<rect class="tr" x="{COLS["bar"]}" y="{cy - 12}" width="160" height="10" rx="5"/>')
        out.append(f'<rect x="{COLS["bar"]}" y="{cy - 12}" width="{bw:.0f}" height="10" rx="5" fill="{r["color"]}"/>')
    out.append(hline(y + ROW_H))
    return out


def total_svg(total: dict, y: float) -> list[str]:
    cy = y + ROW_H / 2 + 5
    out = [f'<text class="tt" x="42" y="{cy}">Total</text>']
    out += [f'<text class="tt" x="{COLS[k] + 60}" y="{cy}" text-anchor="end">{fmt(total[k])}</text>' for k in ("files", "lines", "code", "comments")]
    return out


def svg(rows: list[dict], total: dict) -> str:
    h = TOP + ROW_H * (len(rows) + 1) + 24
    totcode = total["code"] or 1
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{h}" viewBox="0 0 {W} {h}" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif">',
         STYLE, f'<rect class="bg" x=".5" y=".5" width="{W - 1}" height="{h - 1}" rx="10"/>']
    o += header_svg(total)
    y = TOP
    for r in rows:
        o += row_svg(r, y, totcode)
        y += ROW_H
    o += total_svg(total, y)
    o.append("</svg>")
    return "\n".join(o)


def main() -> None:
    files = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True).stdout.splitlines()
    acc = {k: {"files": 0, "blank": 0, "comments": 0, "code": 0} for k, _, _ in AREAS}
    for p in files:
        if skipped(p):
            continue
        for key, _, match in AREAS:
            if match(p):
                b, c, k = count(p)
                a = acc[key]
                a["files"] += 1
                a["blank"] += b
                a["comments"] += c
                a["code"] += k
                break
    rows = []
    for key, label, _ in AREAS:
        a = acc[key]
        prose = key == "docs"  # Markdown is prose: show lines only
        rows.append({"key": key, "label": label, "color": COLORS[key], "files": a["files"],
                     "lines": a["code"] + a["comments"],
                     "code": None if prose else a["code"], "comments": None if prose else a["comments"]})
    order = ["frontend", "frontend_tests", "backend", "backend_tests", "docs"]
    rows.sort(key=lambda r: order.index(r["key"]))
    total = {"files": sum(r["files"] for r in rows), "lines": sum(r["lines"] for r in rows),
             "code": sum(r["code"] or 0 for r in rows), "comments": sum(r["comments"] or 0 for r in rows)}
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "code-stats.svg").write_text(svg(rows, total), encoding="utf-8")
    (OUT / "stats.json").write_text(json.dumps({"areas": rows, "total": total}, indent=2))
    print(json.dumps(total), [(r["key"], r["lines"], r["code"]) for r in rows])


if __name__ == "__main__":
    main()
