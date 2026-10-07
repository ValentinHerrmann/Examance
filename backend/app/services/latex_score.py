"""Points of an exercise, read from its LaTeX (\\BE, \\hBE, \\qBE, \\Lmulti or an override)."""
from __future__ import annotations

import re


def parse_exercise_score(latex_content: str) -> float:
    """Parse max score from exercise latex content."""
    if not latex_content:
        return 0.0

    override = re.search(r"\\begin\{Aufgabe\}\[([\d.]+)\]", latex_content)
    if override:
        try:
            return float(override.group(1))
        except ValueError:
            pass

    full = len(re.findall(r"\\BE\b", latex_content))
    full += len(re.findall(r"\\Lmulti\b", latex_content))
    half = len(re.findall(r"\\hBE\b", latex_content))
    quart = len(re.findall(r"\\qBE\b", latex_content))

    return full * 1.0 + half * 0.5 + quart * 0.25
