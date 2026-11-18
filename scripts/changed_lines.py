"""Filter `path:line:...` findings (or ESLint JSON) on stdin to the changed lines of a unified diff; exits 1 when any remain (used by sonar-check.sh)."""
import json
import os
import re
import sys
from pathlib import Path

_HUNK = re.compile(r"\+(\d+)(?:,(\d+))?")
_FINDING = re.compile(r"(?:\./)?([^:\s]+):(\d+):")


def changed_lines(diff: str) -> dict[str, set[int]]:
    """Added or edited line numbers per file of a `git diff -U0`."""
    changed: dict[str, set[int]] = {}
    current = ""
    for line in diff.splitlines():
        if line.startswith("+++ "):
            current = line[6:] if line.startswith("+++ b/") else ""
            continue
        hunk = _HUNK.search(line) if line.startswith("@@") and current else None
        if hunk:
            start, count = int(hunk.group(1)), int(hunk.group(2) or 1)
            changed.setdefault(current, set()).update(range(start, start + count))
    return changed


def as_lines(text: str) -> list[str]:
    """ESLint's JSON output (ESLint 9 dropped the line formats) as `path:line:col: rule message`."""
    if not text.lstrip().startswith("["):
        return text.splitlines()
    lines = []
    for report in json.loads(text):
        path = os.path.relpath(report["filePath"])
        for m in report["messages"]:
            where = f"{path}:{m.get('line', 0)}:{m.get('column', 0)}"
            lines.append(f"{where}: {m.get('ruleId')} {m['message']}")
    return lines


def main(prefix: str, diff_file: str, untracked_file: str) -> int:
    changed = changed_lines(Path(diff_file).read_text())
    untracked = set(Path(untracked_file).read_text().split())
    found = 0
    for line in as_lines(sys.stdin.read()):
        finding = _FINDING.match(line)
        if not finding:
            continue
        path = finding.group(1)
        full = path if path.startswith(prefix) else prefix + path
        number = int(finding.group(2))
        # Line 0 is a file-level failure (a parse error), which always counts.
        if full in untracked or number == 0 or number in changed.get(full, set()):
            print(line)
            found += 1
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(*sys.argv[1:4]))
