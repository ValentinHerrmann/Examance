"""LaTeX packages (issue #108): merging rules, account and exam settings, compile integration."""

from __future__ import annotations

import json
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.latex_packages import (
    LAZY_PACKAGES,
    PackageEntry,
    PackageLayer,
    exercise_entries,
    package_preamble,
    resolve_packages,
    stored_entries,
    with_packages,
)

from .factors import sign_in


def test_levels_merge_without_clashes() -> None:
    resolved = resolve_packages(
        [
            PackageLayer(
                "account",
                [
                    PackageEntry("package", "xcolor", "dvipsnames"),
                    PackageEntry("package", "cleveref"),
                ],
            ),
            PackageLayer(
                "exercise",
                exercise_entries(
                    "\\usepackage[table]{xcolor}\n\\usepackage{enumerate}\n"
                    "\\usepackage[T1]{fontenc}\n\\usepackage[margin=2cm]{geometry}\n"
                    "\\usepackage[locale=US]{siunitx}\n\\usepgfplotslibrary{fillbetween}"
                ),
                "A",
            ),
            PackageLayer("exercise", exercise_entries("\\usepackage[locale=FR]{siunitx}"), "B"),
        ]
    )
    by_name = {p.name: p for p in resolved.packages}
    assert by_name["xcolor"].options == ["dvipsnames", "table"]
    assert by_name["enumitem"].options == ["shortlabels"]
    assert by_name["siunitx"].options == ["locale=FR"]
    assert "cleveref" in by_name
    assert "pgfplots" in by_name
    assert "geometry" not in by_name
    assert "fontenc" not in by_name
    notes = {(n.code, n.name, n.detail) for n in resolved.notes}
    assert ("conflict", "siunitx", "locale") in notes
    assert ("ignored", "geometry", "locked") in notes
    assert ("ignored", "fontenc", "xetex") in notes
    assert ("aliased", "enumerate", "enumitem") in notes
    assert ("added", "pgfplots", "") in notes

    preamble = package_preamble(resolved)
    assert "\\PassOptionsToPackage{dvipsnames,table}{xcolor}" in preamble
    assert "\\def\\ExamancePackages{%" in preamble
    assert "\\usepgfplotslibrary{fillbetween}%" in preamble


def test_body_scan_skips_comments_and_verbatim() -> None:
    entries = exercise_entries(
        "% \\usepackage{commented}\n\\begin{lstlisting}\n\\usepackage{listed}\n\\end{lstlisting}"
        " \\usepackage{after}\n\\verb|\\usepackage{inline}| \\usetikzlibrary{ calc , mindmap }"
    )
    assert [(e.kind, e.name) for e in entries] == [
        ("package", "after"),
        ("tikzlibrary", "calc"),
        ("tikzlibrary", "mindmap"),
    ]


def test_inline_verbatim_stops_at_its_delimiter_in_linear_time() -> None:
    # SonarCloud S5843: `(?:(?!\1).)*\1` became `.*?\1`, which ends at the same first delimiter.
    entries = exercise_entries("\\verb+a+ \\usepackage{xcolor} \\lstinline[x]!\\usepackage{hidden}!")
    assert [e.name for e in entries] == ["xcolor"]
    start = time.perf_counter()
    assert exercise_entries("\\verb|" + "a" * 100_000) == []
    assert time.perf_counter() - start < 1


def test_cleveref_loads_after_hyperref() -> None:
    preamble = package_preamble(
        resolve_packages([PackageLayer("account", [PackageEntry("package", "cleveref")])])
    )
    assert "\\def\\ExamancePackagesAfterHyperref{%\n  \\RequirePackage{cleveref}%\n}" in preamble
    assert "\\def\\ExamancePackages{" not in preamble


@pytest.mark.asyncio
async def test_account_packages_roundtrip_and_validation(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, "packages@example.com")
    resp = await client.get("/api/v1/user/latex-packages")
    assert resp.status_code == 200
    assert resp.json() == {"entries": [], "all_subject_packages": False}

    entries = [
        {"kind": "package", "name": "siunitx", "options": " locale=DE "},
        {"kind": "tikzlibrary", "name": "mindmap"},
    ]
    resp = await client.put("/api/v1/user/latex-packages", json={"entries": entries})
    assert resp.status_code == 200, resp.text
    assert resp.json()["entries"][0] == {
        "kind": "package",
        "name": "siunitx",
        "options": "locale=DE",
    }
    assert (await client.get("/api/v1/user/latex-packages")).json()["entries"][1][
        "name"
    ] == "mindmap"

    for bad in (
        [{"name": "fontenc"}],  # pdfLaTeX only
        [{"name": "geometry", "options": "margin=2cm"}],  # template layout
        [{"name": "x", "options": "a\\b"}],  # no commands in options
        [{"name": "../evil"}],
        [{"name": "siunitx"}, {"name": "siunitx"}],
        [{"kind": "tikzlibrary", "name": "calc", "options": "x"}],
    ):
        resp = await client.put("/api/v1/user/latex-packages", json={"entries": bad})
        assert resp.status_code == 422, bad


@pytest.mark.asyncio
async def test_exam_ignores_a_latex_packages_field(client: AsyncClient, db: AsyncSession) -> None:
    """Exam-level packages were dropped (issue #272): the field is ignored, never stored."""
    await sign_in(client, db, "exam-packages@example.com")
    resp = await client.post(
        "/api/v1/exams",
        json={
            "title": "Packages",
            "retention_until": (date.today() + timedelta(days=30)).isoformat(),
            "latex_packages": [{"name": "cleveref"}],
        },
    )
    assert resp.status_code == 201, resp.text
    assert "latex_packages" not in resp.json()
    resp = await client.patch(
        f"/api/v1/exams/{resp.json()['id']}", json={"latex_packages": [{"name": "inputenc"}]}
    )
    assert resp.status_code == 200, resp.text
    assert "latex_packages" not in resp.json()


@pytest.mark.asyncio
async def test_account_entry_with_a_retired_disabled_key_still_parses(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, "disabled-key@example.com")
    resp = await client.put(
        "/api/v1/user/latex-packages",
        json={"entries": [{"name": "cleveref", "disabled": True}]},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["entries"] == [{"kind": "package", "name": "cleveref", "options": ""}]


@pytest.mark.asyncio
async def test_template_packages_lists_what_the_template_loads(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, "template-packages@example.com")
    resp = await client.get("/api/v1/latex/template-packages")
    assert resp.status_code == 200
    packages = {p["name"]: p for p in resp.json()["packages"]}
    assert packages["geometry"]["locked"] == "layout"
    assert packages["hyperref"]["options"] == "hidelinks,final"
    assert packages["xcolor"]["locked"] is None
    assert "inputenc" not in packages
    assert {"name": "arrows.meta", "source": "packages"} in resp.json()["tikz_libraries"]


# --- Subject packages load only when used (issue #341) -------------------------------------------

_BLOCK_CASES = json.loads(
    (Path(__file__).parent / "fixtures" / "latex_package_blocks.json").read_text(encoding="utf-8")
)


def _without_header(block: str) -> str:
    """The block without its first comment line, which the frontend words differently."""
    return "\n".join(line for line in block.splitlines() if not line.startswith("% LaTeX packages"))


@pytest.mark.parametrize("case", _BLOCK_CASES, ids=[c["name"] for c in _BLOCK_CASES])
def test_block_matches_the_shared_fixture(case: dict[str, Any]) -> None:
    layers = [PackageLayer("account", stored_entries(case["account"]))]
    block = package_preamble(resolve_packages(layers, case["doc"], case["allSubject"]))
    assert _without_header(block) == _without_header(case["block"])


def test_every_lazy_package_has_triggers_and_a_known_name() -> None:
    assert [lazy.name for lazy in LAZY_PACKAGES][-2:] == ["sty/tikz-uml", "sty/custom-pgf-umlcd"]
    assert all(lazy.triggers for lazy in LAZY_PACKAGES)


def test_all_subject_packages_load_without_triggers() -> None:
    plain = with_packages("\\documentclass{article}\n", [])
    assert plain == "\\documentclass{article}\n"
    every = with_packages("\\documentclass{article}\n", [], all_subject=True)
    for lazy in LAZY_PACKAGES:
        assert f"\\RequirePackage{{{lazy.name}}}" in every


@pytest.mark.asyncio
async def test_all_subject_packages_switch_is_stored(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "subject@example.com")
    assert (await client.get("/api/v1/user/latex-packages")).json()["all_subject_packages"] is False
    resp = await client.put(
        "/api/v1/user/latex-packages", json={"entries": [], "all_subject_packages": True}
    )
    assert resp.json()["all_subject_packages"] is True
    # A save that does not mention the switch leaves it as it is.
    resp = await client.put("/api/v1/user/latex-packages", json={"entries": []})
    assert resp.json()["all_subject_packages"] is True


@pytest.mark.asyncio
async def test_template_overview_marks_subject_packages_as_lazy(
    client: AsyncClient, db: AsyncSession
) -> None:
    await sign_in(client, db, "overview@example.com")
    packages = (await client.get("/api/v1/latex/template-packages")).json()["packages"]
    lazy = {p["name"] for p in packages if p["lazy"]}
    assert {"chemfig", "mhchem", "listings", "tikz-uml"} <= lazy
    assert not any(p["lazy"] for p in packages if p["name"] == "tikz")
