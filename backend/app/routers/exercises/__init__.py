"""Exercises library router — /api/v1/exercises/*

Split by topic (library, sharing, resources). The parts are included in the order the routes were
registered in the single module they came from: FastAPI matches overlapping paths in that order,
so the fixed `/shared` and `/sync-status` must come before `/{exercise_id}`."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import get_teaching_teacher

from . import library, resources, sharing

router = APIRouter(tags=["exercises"], dependencies=[Depends(get_teaching_teacher)])
for _part in (library.listing, sharing.catalog, library.router, sharing.router, resources.router):
    router.include_router(_part, prefix="/exercises")
