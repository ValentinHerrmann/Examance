"""LaTeX packages (issue #108): merging rules, account and exam settings, compile integration."""

from __future__ import annotations

from datetime import date, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.services.latex import compile_exam_latex
from app.services.latex_packages import (
    PackageEntry,
    PackageLayer,
    exercise_entries,
    package_preamble,
    resolve_packages,
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
            PackageLayer("exam", [PackageEntry("package", "cleveref", disabled=True)]),
        ]
    )
    by_name = {p.name: p for p in resolved.packages}
    assert by_name["xcolor"].options == ["dvipsnames", "table"]
    assert by_name["enumitem"].options == ["shortlabels"]
    assert by_name["siunitx"].options == ["locale=FR"]
    assert "cleveref" not in by_name
    assert "pgfplots" in by_name
    assert "geometry" not in by_name and "fontenc" not in by_name
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
    assert resp.json() == {"entries": []}

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
        "disabled": False,
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
async def test_exam_override_follows_patch_rules(client: AsyncClient, db: AsyncSession) -> None:
    await sign_in(client, db, "exam-packages@example.com")
    resp = await client.post(
        "/api/v1/exams",
        json={
            "title": "Packages",
            "retention_until": (date.today() + timedelta(days=30)).isoformat(),
            "latex_packages": [{"name": "cleveref", "disabled": True}],
        },
    )
    assert resp.status_code == 201, resp.text
    exam_id = resp.json()["id"]
    assert resp.json()["latex_packages"] == [
        {"kind": "package", "name": "cleveref", "options": "", "disabled": True}
    ]

    resp = await client.patch(f"/api/v1/exams/{exam_id}", json={"title": "Renamed"})
    assert resp.json()["latex_packages"][0]["name"] == "cleveref"
    resp = await client.patch(f"/api/v1/exams/{exam_id}", json={"latex_packages": None})
    assert resp.json()["latex_packages"] is None
    resp = await client.patch(
        f"/api/v1/exams/{exam_id}", json={"latex_packages": [{"name": "inputenc"}]}
    )
    assert resp.status_code == 422


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


@pytest.mark.asyncio
async def test_exam_compile_writes_all_levels_before_documentclass() -> None:
    exam = SimpleNamespace(
        testart="Kurzarbeit",
        klasse="10a",
        datum="",
        nr="1",
        fach="Informatik",
        lehrernachname="",
        info_text="",
        latex_packages=[{"name": "siunitx", "options": "locale=DE"}],
    )
    exercise = SimpleNamespace(
        id="ex-1", name="A", latex_body="\\usepackage[table]{xcolor}\nText \\BE"
    )
    fake_compile = AsyncMock(return_value=b"%PDF")
    with patch("app.services.latex.compile_latex", fake_compile):
        await compile_exam_latex(
            exam,
            [(exercise, 1, None, None)],
            account_packages=[{"kind": "tikzlibrary", "name": "mindmap"}],
        )
    main_tex = fake_compile.call_args.args[0]
    head = main_tex[: main_tex.index("\\documentclass")]
    assert "\\PassOptionsToPackage{table}{xcolor}" in head
    assert "\\PassOptionsToPackage{locale=DE}{siunitx}" in head
    assert "\\usetikzlibrary{mindmap}%" in head


@pytest.mark.asyncio
async def test_exam_compile_appends_extra_notes_block_last() -> None:
    exam = SimpleNamespace(
        testart="Kurzarbeit",
        klasse="10a",
        datum="",
        nr="1",
        fach="Informatik",
        lehrernachname="",
        info_text="",
        extra_notes={"title": "Platz & mehr", "description": "50%", "min_height_cm": 4, "max_height_cm": 99},
    )
    exercise = SimpleNamespace(id="ex-1", name="A", latex_body="Text \\BE")
    fake_compile = AsyncMock(return_value=b"%PDF")
    with patch("app.services.latex.compile_latex", fake_compile):
        await compile_exam_latex(exam, [(exercise, 1, None, None)])
    main_tex = fake_compile.call_args.args[0]
    notes = "\\ExamNotes{Platz \\& mehr}{50\\%}{4.0}{25.0}"
    assert notes in main_tex
    assert main_tex.index("\\input{") < main_tex.index(notes) < main_tex.index("\\end{document}")
