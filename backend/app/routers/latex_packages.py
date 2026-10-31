"""LaTeX packages (issue #108) — /api/v1/user/latex-packages and /api/v1/latex/template-packages. The account list applies to every document of the account; an exam adds to it through its own ``latex_packages`` field (app/routers/exams.py). Merging rules: app/services/latex_packages.py."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_teacher, get_teaching_teacher
from app.models.teacher import Teacher
from app.schemas.latex_packages import AccountLatexPackages, LatexPackageEntry, TemplatePackages
from app.services.latex_assets import template_packages
from app.services.latex_packages import stored_entries

router = APIRouter(tags=["latex-packages"], dependencies=[Depends(get_teaching_teacher)])


def _account(teacher: Teacher) -> AccountLatexPackages:
    return AccountLatexPackages(
        entries=[
            LatexPackageEntry(kind=e.kind, name=e.name, options=e.options)
            for e in stored_entries(teacher.latex_packages)
        ]
    )


@router.get("/user/latex-packages")
async def get_account_latex_packages(
    teacher: Annotated[Teacher, Depends(get_current_teacher)],
) -> AccountLatexPackages:
    """The packages and libraries the account adds to every document."""
    return _account(teacher)


@router.put("/user/latex-packages")
async def set_account_latex_packages(
    body: AccountLatexPackages,
    teacher: Annotated[Teacher, Depends(get_current_teacher)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AccountLatexPackages:
    """Replace the account's list. Entries are validated (names, options, unsupported packages)."""
    teacher.latex_packages = [
        entry.model_dump(exclude={"disabled"}) for entry in body.entries
    ] or None
    await db.flush()
    return _account(teacher)


@router.get("/latex/template-packages")
async def get_template_packages() -> TemplatePackages:
    """What the exam template loads by itself, read from the bundled .sty files."""
    return TemplatePackages.model_validate(template_packages())
