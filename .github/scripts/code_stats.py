#!/usr/bin/env python3
"""Count lines per area of the tracked files and render the README statistics table and history chart (SVG + JSON).

Usage (from the repository root): code_stats.py; reads the previous badges-out/history.json if present and writes badges-out/.
"""
import json
import math
import re
import subprocess
from datetime import date, timedelta
from pathlib import Path

# Fixed paths, never taken from arguments, so nothing outside this folder is read or written.
OUT = Path("badges-out")
PREVIOUS_HISTORY = OUT / "history.json"

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
# Bump when AREAS, the skip rules or the counting change, so history.json is recounted from scratch.
HISTORY_VERSION = 2
# Comments are their own series after the areas, never part of an area's lines.
ORDER = ["frontend", "backend", "frontend_tests", "backend_tests", "docs", "comments"]
LABELS = {**{k: lbl for k, lbl, _ in AREAS}, "comments": "Comments"}
COLORS = {"frontend": "#FF3E00", "frontend_tests": "#F59E0B", "backend": "#009688", "backend_tests": "#6DA13F", "docs": "#3B82F6",
          "comments": "#8B949E"}

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


def count(text: str, ext: str) -> tuple[int, int, int]:
    """Return (blank, comment, code) lines; Markdown is all prose, so it counts as code-free."""
    tally = {"blank": 0, "comment": 0, "code": 0}
    end = None
    # Same line splitting as iterating a text-mode file (universal newlines).
    lines = text.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if lines[-1] == "":
        lines.pop()
    for raw in lines:
        kind, end = classify(raw.strip(), ext, end)
        tally[kind] += 1
    return tally["blank"], tally["comment"], tally["code"]


class Repo:
    """Reads blobs through one `git cat-file --batch` process and caches per-blob counts across revisions."""

    def __init__(self) -> None:
        self.cat = subprocess.Popen(["git", "cat-file", "--batch"], stdin=subprocess.PIPE, stdout=subprocess.PIPE)
        self.cache: dict[tuple[str, str], tuple[int, int, int]] = {}

    def blob(self, sha: str) -> str:
        assert self.cat.stdin and self.cat.stdout
        self.cat.stdin.write(sha.encode() + b"\n")
        self.cat.stdin.flush()
        size = int(self.cat.stdout.readline().split()[2])
        data = self.cat.stdout.read(size)
        self.cat.stdout.read(1)  # trailing newline
        return data.decode("utf-8", errors="replace")

    def tally(self, rev: str) -> dict:
        """Count lines per area for the tree of one revision."""
        tree = subprocess.run(["git", "ls-tree", "-r", "-z", rev], capture_output=True, check=True).stdout.decode()
        acc = {k: {"files": 0, "blank": 0, "comments": 0, "code": 0} for k, _, _ in AREAS}
        for entry in filter(None, tree.split("\0")):
            meta, path = entry.split("\t", 1)
            mode, kind, sha = meta.split()
            if kind != "blob" or mode == "120000" or skipped(path):
                continue
            for key, _, match in AREAS:
                if match(path):
                    ext = Path(path).suffix
                    if (sha, ext) not in self.cache:
                        self.cache[(sha, ext)] = count(self.blob(sha), ext)
                    b, c, k = self.cache[(sha, ext)]
                    a = acc[key]
                    a["files"] += 1
                    a["blank"] += b
                    a["comments"] += c
                    a["code"] += k
                    break
        return acc


def fmt(n: int) -> str:
    return f"{n:,}".replace(",", " ")


W, ROW_H, TOP = 820, 38, 64
COLS = {"area": 20, "files": 330, "lines": 460, "bar": 560}
HEADERS = [("area", "Area"), ("files", "Files"), ("lines", "Lines"), ("bar", "Share of lines")]
BAR_W = 240
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


def row_svg(r: dict, y: float, total_lines: int) -> list[str]:
    cy = y + ROW_H / 2 + 5
    out = [f'<circle cx="28" cy="{cy - 5}" r="5" fill="{r["color"]}"/>', f'<text class="tx" x="42" y="{cy}">{r["label"]}</text>']
    for key in ("files", "lines"):
        txt = "–" if r[key] is None else fmt(r[key])
        out.append(f'<text class="{"tx" if key == "lines" else "mu"}" x="{COLS[key] + 60}" y="{cy}" text-anchor="end">{txt}</text>')
    if r["lines"]:
        bw = max(3, BAR_W * r["lines"] / total_lines)
        out.append(f'<rect class="tr" x="{COLS["bar"]}" y="{cy - 12}" width="{BAR_W}" height="10" rx="5"/>')
        out.append(f'<rect x="{COLS["bar"]}" y="{cy - 12}" width="{bw:.0f}" height="10" rx="5" fill="{r["color"]}"/>')
    out.append(hline(y + ROW_H))
    return out


def total_svg(total: dict, y: float) -> list[str]:
    cy = y + ROW_H / 2 + 5
    out = [f'<text class="tt" x="42" y="{cy}">Total</text>']
    out += [f'<text class="tt" x="{COLS[k] + 60}" y="{cy}" text-anchor="end">{fmt(total[k])}</text>' for k in ("files", "lines")]
    return out


def svg(rows: list[dict], total: dict) -> str:
    h = TOP + ROW_H * (len(rows) + 1) + 24
    total_lines = total["lines"] or 1
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{h}" viewBox="0 0 {W} {h}" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif">',
         STYLE, f'<rect class="bg" x=".5" y=".5" width="{W - 1}" height="{h - 1}" rx="10"/>']
    o += header_svg(total)
    y = TOP
    for r in rows:
        o += row_svg(r, y, total_lines)
        y += ROW_H
    o += total_svg(total, y)
    o.append("</svg>")
    return "\n".join(o)


def nice_step(span: float) -> float:
    """Round a raw axis step up to 1, 2, 2.5 or 5 times a power of ten."""
    mag = 10 ** math.floor(math.log10(span)) if span > 0 else 1
    return next(m * mag for m in (1, 2, 2.5, 5, 10) if m * mag >= span)


def short(n: float, digits: int | None = None) -> str:
    if n < 1000:
        return f"{n:g}"
    return f"{n / 1000:.{digits}f}k" if digits is not None else f"{n / 1000:g}k"


# History charts are half the table's width so the README can show two side by side at 1:1.
HW = 410
HX0, HX1, HY0, HY1 = 48, HW - 16, 124, 300  # plot area of the history charts


def legend_svg(last: dict) -> list[str]:
    out = []
    for i, key in enumerate(ORDER):  # two columns, row-major
        x, cy = 20 + 190 * (i % 2), 54 + 20 * (i // 2)
        out.append(f'<circle cx="{x + 5}" cy="{cy}" r="5" fill="{COLORS[key]}"/>')
        out.append(f'<text class="mu" x="{x + 15}" y="{cy + 4}" style="font-size:12px">{LABELS[key]} '
                   f'<tspan class="tx" style="font-size:12px">{short(last.get(key, 0), 1)}</tspan></text>')
    return out


def axes_svg(days: list[dict], ymax: float, step: float) -> list[str]:
    out = []
    v = 0.0
    while v <= ymax + 1e-9:
        y = HY1 - (HY1 - HY0) * v / ymax
        out.append(f'<line class="ln" x1="{HX0}" x2="{HX1}" y1="{y:.1f}" y2="{y:.1f}"/>')
        out.append(f'<text class="mu" x="{HX0 - 8}" y="{y + 4:.1f}" text-anchor="end" style="font-size:12px">{short(v)}</text>')
        v += step
    first, last = date.fromisoformat(days[0]["date"]), date.fromisoformat(days[-1]["date"])
    span = (last - first).days
    ticks = min(4, span + 1)
    for i in range(ticks):
        d = first + timedelta(days=round(span * i / max(ticks - 1, 1)))
        x = HX0 + (HX1 - HX0) * (d - first).days / span if span else (HX0 + HX1) / 2
        lbl = f"{d:%b %Y}" if span > 365 else f"{d:%b} {d.day}"
        anchor = "middle"
        if ticks > 1 and i == 0:
            anchor = "start"
        elif ticks > 1 and i == ticks - 1:
            anchor = "end"
        out.append(f'<text class="mu" x="{x:.1f}" y="{HY1 + 20}" text-anchor="{anchor}" style="font-size:12px">{lbl}</text>')
    return out


def pt(x: float, v: float, ymax: float) -> str:
    return f"{x:.1f},{HY1 - (HY1 - HY0) * v / ymax:.1f}"


def bands_svg(days: list[dict], ymax: float, xs: list[float]) -> list[str]:
    out = []
    lower = [0] * len(days)
    for key in ORDER:
        upper = [lo + d["lines"].get(key, 0) for lo, d in zip(lower, days)]
        top = [pt(x, v, ymax) for x, v in zip(xs, upper)]
        bottom = [pt(x, v, ymax) for x, v in zip(reversed(xs), reversed(lower))]
        out.append(f'<polygon points="{" ".join(top + bottom)}" fill="{COLORS[key]}" fill-opacity=".85"/>')
        out.append(f'<polyline points="{" ".join(top)}" fill="none" stroke="{COLORS[key]}" stroke-width="1.5"/>')
        lower = upper
    return out


def lines_svg(days: list[dict], ymax: float, xs: list[float]) -> list[str]:
    out = []
    for key in reversed(ORDER):  # first area drawn last, on top
        points = " ".join(pt(x, d["lines"].get(key, 0), ymax) for x, d in zip(xs, days))
        out.append(f'<polyline points="{points}" fill="none" stroke="{COLORS[key]}" stroke-width="2" '
                   'stroke-linejoin="round" stroke-linecap="round"/>')
    return out


def history_svg(days: list[dict], stacked: bool) -> str:
    """Area lines over time, x spaced by real dates: stacked areas, or one line per area."""
    h = HY1 + 36
    title = "Code over time" if stacked else "Code per area over time"
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{HW}" height="{h}" viewBox="0 0 {HW} {h}" font-family="-apple-system,Segoe UI,Helvetica,Arial,sans-serif">',
         STYLE, f'<rect class="bg" x=".5" y=".5" width="{HW - 1}" height="{h - 1}" rx="10"/>',
         f'<text class="ti" x="20" y="30">{title}</text>',
         f'<text class="mu" x="{HW - 20}" y="30" text-anchor="end" style="font-size:12px">since {days[0]["date"]}</text>']
    o += legend_svg(days[-1]["lines"])
    if len(days) == 1:
        days = days * 2  # a single day renders as a flat strip
    first = date.fromisoformat(days[0]["date"])
    span = (date.fromisoformat(days[-1]["date"]) - first).days
    xs = [HX0 + (HX1 - HX0) * ((date.fromisoformat(d["date"]) - first).days / span if span else i / (len(days) - 1))
          for i, d in enumerate(days)]
    peak = max(sum(d["lines"].values()) if stacked else max(d["lines"].values(), default=0) for d in days) or 1
    step = nice_step(peak / 4)
    ymax = step * math.ceil(peak / step)
    o += axes_svg(days, ymax, step)
    o += (bands_svg if stacked else lines_svg)(days, ymax, xs)
    o.append(f'<line class="ln" x1="{HX0}" x2="{HX1}" y1="{HY1}" y2="{HY1}"/>')
    o.append("</svg>")
    return "\n".join(o)


def area_lines(acc: dict) -> dict:
    """Lines per series: code lines per area (Markdown has no comments, so docs are its prose lines), all comments apart."""
    return {**{key: acc[key]["code"] for key, _, _ in AREAS}, "comments": sum(a["comments"] for a in acc.values())}


def load_history() -> dict[str, dict]:
    """Previous days keyed by date; a missing file or another HISTORY_VERSION recounts everything."""
    try:
        data = json.loads(PREVIOUS_HISTORY.read_text())
    except (OSError, ValueError):
        data = {}
    if data.get("version") != HISTORY_VERSION:
        return {}
    return {d["date"]: d for d in data.get("days", [])}


def history(repo: Repo, head_acc: dict, cached: dict[str, dict]) -> list[dict]:
    """One entry per day: the last first-parent commit of that day, reusing cached days with the same commit."""
    log = subprocess.run(["git", "log", "--first-parent", "--format=%H %cs", "HEAD"],
                         capture_output=True, text=True, check=True).stdout.split("\n")
    head = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    days: dict[str, str] = {}
    for line in filter(None, log):
        sha, date = line.split()
        days.setdefault(date, sha)  # log is newest first
    out, recounted = [], 0
    for date in sorted(days):
        sha = days[date]
        if sha == head:
            lines = area_lines(head_acc)
        elif cached.get(date, {}).get("sha") == sha:
            lines = cached[date]["lines"]
        else:
            lines = area_lines(repo.tally(sha))
            recounted += 1
        out.append({"date": date, "sha": sha, "lines": lines})
    print(f"history: {len(out)} days, {recounted} recounted")
    return out


def main() -> None:
    repo = Repo()
    acc = repo.tally("HEAD")
    lines = area_lines(acc)
    rows = [{"key": key, "label": LABELS[key], "color": COLORS[key], "files": acc[key]["files"] if key in acc else None,
             "lines": lines[key]} for key in ORDER]
    total = {"files": sum(r["files"] or 0 for r in rows), "lines": sum(r["lines"] for r in rows)}
    days = history(repo, acc, load_history())
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "code-stats.svg").write_text(svg(rows, total), encoding="utf-8")
    (OUT / "code-history.svg").write_text(history_svg(days, stacked=True), encoding="utf-8")
    (OUT / "code-history-lines.svg").write_text(history_svg(days, stacked=False), encoding="utf-8")
    (OUT / "stats.json").write_text(json.dumps({"areas": rows, "total": total}, indent=2))
    (OUT / "history.json").write_text(json.dumps({"version": HISTORY_VERSION, "days": days}))
    print(json.dumps(total), [(r["key"], r["lines"]) for r in rows])


if __name__ == "__main__":
    main()
