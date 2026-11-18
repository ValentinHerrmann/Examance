"""Filter `path:line:...` findings (or ESLint JSON) to changed lines; stdin carries the diff, the untracked files and the findings, split by markers (sonar-check.sh), so no path comes from the command line."""
import json
import os
import re
import sys

_HUNK = re.compile(r"\+(\d+)(?:,(\d+))?")
_FINDING = re.compile(r"(?:\./)?([^:\s]+):(\d+):")
UNTRACKED = "@@SONAR-CHECK-UNTRACKED@@"
FINDINGS = "@@SONAR-CHECK-FINDINGS@@"


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


def main(prefix: str) -> int:
    diff, _, rest = ("\n" + sys.stdin.read()).partition(f"\n{UNTRACKED}\n")
    untracked_text, _, findings = ("\n" + rest).partition(f"\n{FINDINGS}\n")
    changed = changed_lines(diff)
    untracked = set(untracked_text.split())
    found = 0
    for line in as_lines(findings):
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
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else ""))
