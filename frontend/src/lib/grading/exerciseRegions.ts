/** Which exercise owns which area of the scan (issues #234, #235), read from the printed score boxes: an exercise's area runs from its box down to the next box in reading order. Pure; the viewer maps scan pixels to template points. */

import type { OmrPageTemplate } from "#lib/db/schema";
import type { GradingTarget } from "./gradingTargets";

/** Marks may reach this far into a neighbouring area without asking (feedback written at the border); the dimming starts there. */
export const REGION_TOLERANCE_PT = (5 / 25.4) * 72;
/** A box sits on its heading's line: the area starts a little above the box, so the heading belongs to it. */
const HEADING_ROOM_PT = (4 / 25.4) * 72;

/** One exercise's or part's area; `partLabel` null = the exercise as a whole (its intro, or every member of an MC group). */
export interface ExerciseRegion {
  exerciseIds: string[];
  partLabel: string | null;
  /** Reading-order offsets (see `offsetOf`), start inclusive, end exclusive. */
  start: number;
  end: number;
}

export interface RegionMap {
  regions: ExerciseRegion[];
  pageHeights: number[];
  /** The page header above the first exercise (name, date, title): owned by no exercise, always dimmed; null without areas. */
  header: { start: number; end: number } | null;
}

/** Page stride of the reading-order offset; larger than any page height in points. */
const PAGE_STRIDE = 100_000;

/** Reading-order offset of a template point: page by page, top to bottom (`yPt` from the bottom like PDF points). */
export function offsetOf(map: RegionMap, page: number, yPt: number): number {
  const h = map.pageHeights[page - 1] ?? 0;
  return (page - 1) * PAGE_STRIDE + Math.min(h, Math.max(0, h - yPt));
}

/** The areas of every exercise and part; empty without a position mapping (then nothing is checked or dimmed). */
export function buildExerciseRegions(pages: OmrPageTemplate[], positions: Record<number, string[]>): RegionMap {
  const map: RegionMap = { regions: [], pageHeights: pages.map((p) => p.pageHeightPt), header: null };
  if (Object.keys(positions).length === 0) return map;
  type Start = { at: number; ids: string[] | null; part: string | null };
  const starts: Start[] = [];
  let lastBoxPage = 0;
  pages.forEach((page, i) => {
    for (const box of page.scoreBoxes ?? []) {
      lastBoxPage = i + 1;
      const top = box.rect[3];
      // The points table ends the exercises: everything from its top on belongs to none.
      if (box.box === "cell" || box.box === "sum" || box.box === "grade") {
        starts.push({ at: offsetOf(map, i + 1, top), ids: null, part: null });
        continue;
      }
      const ids = box.position === undefined ? undefined : positions[box.position];
      if (!ids?.length) continue;
      starts.push({ at: offsetOf(map, i + 1, top + HEADING_ROOM_PT), ids, part: box.box === "part" ? (box.part ?? null) : null });
    }
  });
  starts.sort((a, b) => a.at - b.at);
  // Pages after the last one with a box are writing pages (extra pages, filler pages): they belong to none.
  const end = lastBoxPage * PAGE_STRIDE - PAGE_STRIDE + (map.pageHeights[lastBoxPage - 1] ?? 0);
  starts.forEach((s, i) => {
    const next = i + 1 < starts.length ? starts[i + 1].at : end;
    // A table start before the next exercise's box closes the area; repeated starts (same box twice) collapse.
    if (s.ids && next > s.at) map.regions.push({ exerciseIds: s.ids, partLabel: s.part, start: s.at, end: next });
  });
  const first = map.regions[0];
  if (first) {
    const pageStart = Math.floor(first.start / PAGE_STRIDE) * PAGE_STRIDE;
    if (first.start > pageStart) map.header = { start: pageStart, end: first.start };
  }
  return map;
}

/** The area at a reading-order offset; null where no exercise owns the page (cover header, points table, writing pages). */
export function regionAt(map: RegionMap, at: number): ExerciseRegion | null {
  return map.regions.find((r) => at >= r.start && at < r.end) ?? null;
}

/** Whether a mark of the active target belongs in the area without asking: same exercise and part, the exercise's intro, or a member of the MC group. */
export function regionAccepts(region: ExerciseRegion, exerciseId: string, partLabel: string): boolean {
  if (!region.exerciseIds.includes(exerciseId)) return false;
  return region.partLabel === null || region.partLabel === partLabel;
}

/** Whether a mark at `at` needs no question: the active target owns the area there or within the border tolerance on the same page. */
export function acceptsNear(map: RegionMap, at: number, exerciseId: string, partLabel: string): boolean {
  const page = Math.floor(at / PAGE_STRIDE);
  const pageStart = page * PAGE_STRIDE;
  const pageEnd = pageStart + (map.pageHeights[page] ?? 0);
  const from = Math.max(pageStart, at - REGION_TOLERANCE_PT);
  const to = Math.min(pageEnd, at + REGION_TOLERANCE_PT);
  return map.regions.some((r) => r.start < to && r.end > from && regionAccepts(r, exerciseId, partLabel));
}

/** The area a target is graded in: its part's area, else its exercise's (intro or MC group); null when the layout has none. */
export function targetRegion(map: RegionMap, exerciseId: string, partLabel: string): ExerciseRegion | null {
  const own = map.regions.filter((r) => r.exerciseIds.includes(exerciseId));
  return own.find((r) => r.partLabel === partLabel && partLabel !== "") ?? own.find((r) => r.partLabel === null) ?? own[0] ?? null;
}

/** Page (1-based) and top in points of a reading-order offset. */
export function pageAndTop(at: number): { page: number; top: number } {
  const page = Math.floor(at / PAGE_STRIDE);
  return { page: page + 1, top: at - page * PAGE_STRIDE };
}

/** The grading targets a mark in the area may go to (for the switch question). */
export function regionTargets(region: ExerciseRegion, targets: GradingTarget[]): GradingTarget[] {
  return targets.filter((t) => region.exerciseIds.includes(t.exercise.id) && (region.partLabel === null || t.partLabel === region.partLabel));
}

/** How strongly an area is dimmed while the target is active: 0 where marking never asks, light for sibling parts, strong for other exercises. */
export type DimLevel = 0 | 1 | 2;

export function dimLevel(region: ExerciseRegion, exerciseId: string, partLabel: string): DimLevel {
  if (regionAccepts(region, exerciseId, partLabel)) return 0;
  return region.exerciseIds.includes(exerciseId) ? 1 : 2;
}

/** A dimmed stretch of one page in template points from the page top, with its strength (1–2). */
export interface DimBand {
  top: number;
  bottom: number;
  level: DimLevel;
}

/** The dimmed stretches of one page, with sharp edges; an area the target owns stays clear up to the border tolerance, so "undimmed" matches "never asks". The header above the first exercise is always dimmed. */
export function dimBands(map: RegionMap, page: number, exerciseId: string, partLabel: string): DimBand[] {
  const pageStart = (page - 1) * PAGE_STRIDE;
  const height = map.pageHeights[page - 1] ?? 0;
  const areas = [...(map.header ? [{ ...map.header, level: 2 as DimLevel }] : []), ...map.regions.map((r) => ({ start: r.start, end: r.end, level: dimLevel(r, exerciseId, partLabel) }))];
  const pieces = areas
    .filter((r) => r.end > pageStart && r.start < pageStart + height)
    .map((r) => ({ top: Math.max(0, r.start - pageStart), bottom: Math.min(height, r.end - pageStart), level: r.level }));
  const bands: DimBand[] = [];
  pieces.forEach((p, i) => {
    if (p.level === 0) return;
    const clearAbove = i > 0 && pieces[i - 1].level === 0 && pieces[i - 1].bottom >= p.top;
    const clearBelow = i + 1 < pieces.length && pieces[i + 1].level === 0 && pieces[i + 1].top <= p.bottom;
    const top = clearAbove ? p.top + REGION_TOLERANCE_PT : p.top;
    const bottom = clearBelow ? p.bottom - REGION_TOLERANCE_PT : p.bottom;
    if (bottom > top) bands.push({ top, bottom, level: p.level });
  });
  return bands;
}
