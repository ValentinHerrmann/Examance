#!/usr/bin/env python3
"""Count lines per area of the tracked files and render a table SVG plus stats.json for the README."""
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

# First matching area wins, so order matters. (key, label, matcher)
AREAS = [
    ("frontend_tests", "Frontend tests", lambda p: TEST.search(p) and p.startswith("frontend/") and re.search(CODE_EXT, p)),
    ("backend_tests", "Backend tests", lambda p: TEST.search(p) and p.startswith("backend/") and re.search(CODE_EXT, p)),
    ("docs", "Documentation", lambda p: p.endswith(".md")),
    ("frontend", "Frontend", lambda p: p.startswith("frontend/") and re.search(CODE_EXT, p)),
    ("backend", "Backend", lambda p: p.startswith("backend/") and re.search(CODE_EXT + r"|\.tex$|\.sty$|\.cls$", p)),
]
COLORS = {"frontend": "#FF3E00", "frontend_tests": "#F59E0B", "backend": "#009688", "backend_tests": "#6DA13F", "docs": "#3B82F6"}

LINE_COMMENT = {".py": "#", ".sh": "#", ".yml": "#", ".yaml": "#", ".toml": "#", ".sql": "--",
                ".ts": "//", ".js": "//", ".mjs": "//", ".cjs": "//", ".svelte": "//"}
BLOCK_COMMENT = {".ts": ("/*", "*/"), ".js": ("/*", "*/"), ".mjs": ("/*", "*/"), ".cjs": ("/*", "*/"),
                 ".css": ("/*", "*/"), ".svelte": ("/*", "*/"), ".html": ("<!--", "-->")}


def count(path: str) -> tuple[int, int, int]:
    """Return (blank, comment, code) lines; Markdown is all prose, so it counts as code-free."""
    ext = Path(path).suffix
    line_c, block_c = LINE_COMMENT.get(ext), BLOCK_COMMENT.get(ext)
    blank = comment = code = 0
    end = None
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for raw in f:
                s = raw.strip()
                if not s:
                    blank += 1
                elif end:
                    comment += 1
                    if end in s:
                        end = None
                elif block_c and s.startswith(block_c[0]):
                    comment += 1
                    if block_c[1] not in s[len(block_c[0]):]:
                        end = block_c[1]
                elif block_c and ext == ".svelte" and s.startswith("<!--"):
                    comment += 1
                    if "-->" not in s:
                        end = "-->"
                elif line_c and s.startswith(line_c):
                    comment += 1
                else:
                    code += 1
    except OSError:
        pass
    return blank, comment, code


def fmt(n: int) -> str:
    return f"{n:,}".replace(",", " ")


def svg(rows: list[dict], total: dict) -> str:
    w, rh, top = 820, 38, 64
    h = top + rh * (len(rows) + 1) + 24
    cols = {"area": 20, "files": 250, "lines": 335, "code": 435, "comments": 535, "bar": 630}
    totcode = total["code"] or 1
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif">',
         '<style>.bg{fill:#fff;stroke:#d0d7de}.hd{fill:#57606a;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}'
         '.tx{fill:#1f2328;font-size:14px}.mu{fill:#57606a;font-size:14px}.tt{fill:#1f2328;font-size:14px;font-weight:700}.ln{stroke:#d0d7de}'
         '.ti{fill:#1f2328;font-size:17px;font-weight:700}.tr{fill:#eaeef2}'
         '@media (prefers-color-scheme:dark){.bg{fill:#0d1117;stroke:#30363d}.hd,.mu{fill:#8b949e}.tx,.tt,.ti{fill:#e6edf3}.ln{stroke:#30363d}.tr{fill:#21262d}}</style>',
         f'<rect class="bg" x=".5" y=".5" width="{w - 1}" height="{h - 1}" rx="10"/>',
         f'<text class="ti" x="20" y="30">Code statistics</text>',
         f'<text class="mu" x="{w - 20}" y="30" text-anchor="end" style="font-size:12px">{total["files"]} files · updated automatically</text>']
    y = top
    for key, label in [("area", "Area"), ("files", "Files"), ("lines", "Lines"), ("code", "Code"), ("comments", "Comments"), ("bar", "Share of code")]:
        anchor = "start" if key in ("area", "bar") else "end"
        x = cols[key] if anchor == "start" else cols[key] + 60
        o.append(f'<text class="hd" x="{x}" y="{y - 10}" text-anchor="{anchor}">{label}</text>')
    o.append(f'<line class="ln" x1="20" x2="{w - 20}" y1="{y}" y2="{y}"/>')
    for r in rows:
        cy = y + rh / 2 + 5
        o.append(f'<circle cx="28" cy="{cy - 5}" r="5" fill="{r["color"]}"/>')
        o.append(f'<text class="tx" x="42" y="{cy}">{r["label"]}</text>')
        for key, val in [("files", r["files"]), ("lines", r["lines"]), ("code", r["code"]), ("comments", r["comments"])]:
            txt = "–" if val is None else fmt(val)
            o.append(f'<text class="{"mu" if key != "code" else "tx"}" x="{cols[key] + 60}" y="{cy}" text-anchor="end">{txt}</text>')
        if r["code"]:
            bw = max(3, 160 * r["code"] / totcode)
            o.append(f'<rect class="tr" x="{cols["bar"]}" y="{cy - 12}" width="160" height="10" rx="5"/>')
            o.append(f'<rect x="{cols["bar"]}" y="{cy - 12}" width="{bw:.0f}" height="10" rx="5" fill="{r["color"]}"/>')
        y += rh
        o.append(f'<line class="ln" x1="20" x2="{w - 20}" y1="{y}" y2="{y}"/>')
    cy = y + rh / 2 + 5
    o.append(f'<text class="tt" x="42" y="{cy}">Total</text>')
    for key in ("files", "lines", "code", "comments"):
        o.append(f'<text class="tt" x="{cols[key] + 60}" y="{cy}" text-anchor="end">{fmt(total[key])}</text>')
    o.append("</svg>")
    return "\n".join(o)


def main() -> None:
    files = subprocess.run(["git", "ls-files"], capture_output=True, text=True, check=True).stdout.splitlines()
    acc = {k: {"files": 0, "blank": 0, "comments": 0, "code": 0} for k, _, _ in AREAS}
    for p in files:
        if SKIP.search(p):
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
