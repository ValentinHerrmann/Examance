/** Which exercise owns which area of the scan (issues #234, #235), read from the printed score boxes: an exercise's area runs from its box down to the next box in reading order. Pure; the viewer maps scan pixels to template points. */

import type { OmrPageTemplate } from "#lib/db/schema";
import type { GradingTarget } from "./gradingTargets";

/** Marks may reach this far into a neighbouring area without asking (feedback written at the border). */
export const REGION_TOLERANCE_PT = (10 / 25.4) * 72;
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
  const map: RegionMap = { regions: [], pageHeights: pages.map((p) => p.pageHeightPt) };
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

/** Whether a mark at `at` needs no question: the active target owns the area there or within the border tolerance; null areas never accept. */
export function acceptsNear(map: RegionMap, at: number, exerciseId: string, partLabel: string): boolean {
  const page = Math.floor(at / PAGE_STRIDE);
  const pageStart = page * PAGE_STRIDE;
  const pageEnd = pageStart + (map.pageHeights[page] ?? 0);
  const from = Math.max(pageStart, at - REGION_TOLERANCE_PT);
  const to = Math.min(pageEnd, at + REGION_TOLERANCE_PT);
  return map.regions.some((r) => r.start < to && r.end > from && regionAccepts(r, exerciseId, partLabel));
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

/** A dimmed stretch of one page in template points from the page top, with the dimming's strength (0–2) at its top and bottom edge. */
export interface DimBand {
  top: number;
  bottom: number;
  from: number;
  to: number;
}

/** The dimmed stretches of one page; each starts undimmed at the edge of an area the target owns and reaches its level after the tolerance, so "undimmed" matches "never asks". */
export function dimBands(map: RegionMap, page: number, exerciseId: string, partLabel: string): DimBand[] {
  const pageStart = (page - 1) * PAGE_STRIDE;
  const height = map.pageHeights[page - 1] ?? 0;
  const pieces = map.regions
    .filter((r) => r.end > pageStart && r.start < pageStart + height)
    .map((r) => ({ top: Math.max(0, r.start - pageStart), bottom: Math.min(height, r.end - pageStart), level: dimLevel(r, exerciseId, partLabel) as number }));
  const bands: DimBand[] = [];
  pieces.forEach((p, i) => {
    if (p.level === 0) return;
    const above = i > 0 && pieces[i - 1].bottom >= p.top ? pieces[i - 1].level : p.level;
    const below = i + 1 < pieces.length && pieces[i + 1].top <= p.bottom ? pieces[i + 1].level : p.level;
    const fadeTop = Math.min(REGION_TOLERANCE_PT, (p.bottom - p.top) / 2);
    const fadeBottom = fadeTop;
    let top = p.top;
    let bottom = p.bottom;
    if (above < p.level) {
      bands.push({ top, bottom: top + fadeTop, from: above, to: p.level });
      top += fadeTop;
    }
    const tail = below < p.level ? { top: bottom - fadeBottom, bottom, from: p.level, to: below } : null;
    if (tail) bottom -= fadeBottom;
    if (bottom > top) bands.push({ top, bottom, from: p.level, to: p.level });
    if (tail) bands.push(tail);
  });
  return bands;
}
