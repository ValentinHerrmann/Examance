import { describe, expect, it } from 'vitest';
import type { OmrPageTemplate, OmrScoreBoxRect } from '../src/lib/db/schema';
import { acceptsNear, buildExerciseRegions, dimBands, offsetOf, regionAt, REGION_TOLERANCE_PT, targetRegion } from '../src/lib/grading/exerciseRegions';
import { ExerciseGuard, GUARD_COOL_OFF_MS } from '../src/lib/grading/exerciseGuard';
import type { GradingTarget } from '../src/lib/grading/gradingTargets';

const H = 842;
const box = (b: Omit<OmrScoreBoxRect, 'rect'>, top: number): OmrScoreBoxRect => ({ ...b, rect: [500, top - 15, 550, top] });
const page = (i: number, scoreBoxes: OmrScoreBoxRect[] = []): OmrPageTemplate => ({ pageIndex: i, pageWidthPt: 595, pageHeightPt: H, fiducials: [], bubbles: [], scoreBoxes });

// Page 1: exercise 1 (parts a, b); page 2: exercise 1 b continues, then the MC group 2 and the points table; page 3: a writing page.
const pages = [
  page(0, [box({ box: 'task', position: 1 }, 700), box({ box: 'part', position: 1, part: 'a' }, 600), box({ box: 'part', position: 1, part: 'b' }, 300)]),
  page(1, [box({ box: 'task', position: 2 }, 500), box({ box: 'cell', position: 1 }, 150), box({ box: 'sum' }, 150)]),
  page(2),
];
const positions = { 1: ['ex-1'], 2: ['mc-a', 'mc-b'] };
const map = buildExerciseRegions(pages, positions);
const at = (p: number, y: number) => offsetOf(map, p, y);

const target = (id: string, partLabel = ''): GradingTarget => ({ exercise: { id } as never, partLabel, partKey: partLabel || null, max: 1 });
const targets = [target('ex-1', 'a'), target('ex-1', 'b'), target('mc-a'), target('mc-b')];

describe('buildExerciseRegions', () => {
  it('runs an area from its box down to the next one, across a page break', () => {
    expect(regionAt(map, at(1, 650))).toMatchObject({ exerciseIds: ['ex-1'], partLabel: null });
    expect(regionAt(map, at(1, 400))).toMatchObject({ exerciseIds: ['ex-1'], partLabel: 'a' });
    expect(regionAt(map, at(2, 700))).toMatchObject({ exerciseIds: ['ex-1'], partLabel: 'b' });
    expect(regionAt(map, at(2, 300))).toMatchObject({ exerciseIds: ['mc-a', 'mc-b'] });
  });

  it('gives no exercise to the cover above the first box, the points table and writing pages', () => {
    expect(regionAt(map, at(1, 800))).toBeNull();
    expect(regionAt(map, at(2, 100))).toBeNull();
    expect(regionAt(map, at(3, 400))).toBeNull();
  });

  it('is empty without a position mapping', () => {
    expect(buildExerciseRegions(pages, {}).regions).toEqual([]);
  });
});

describe('acceptsNear', () => {
  it('accepts only the own part for a part, the intro for the whole exercise, and the MC group for each member', () => {
    expect(acceptsNear(map, at(1, 650), 'ex-1', 'b')).toBe(false);
    expect(acceptsNear(map, at(1, 650), 'ex-1', '')).toBe(true);
    expect(acceptsNear(map, at(2, 300), 'mc-b', '')).toBe(true);
    expect(acceptsNear(map, at(1, 400), 'ex-1', 'b')).toBe(false);
  });

  it('tolerates marks up to 5 mm across the border, not further', () => {
    const border = 300 + (4 / 25.4) * 72;
    expect(acceptsNear(map, at(1, border + REGION_TOLERANCE_PT - 2), 'ex-1', 'b')).toBe(true);
    expect(acceptsNear(map, at(1, border + REGION_TOLERANCE_PT + 2), 'ex-1', 'b')).toBe(false);
  });
});

describe('targetRegion', () => {
  it('finds the part area for a part, the group area for an MC member', () => {
    expect(targetRegion(map, 'ex-1', 'b')).toMatchObject({ partLabel: 'b' });
    expect(targetRegion(map, 'mc-b', '')).toMatchObject({ exerciseIds: ['mc-a', 'mc-b'] });
  });
});

describe('dimBands', () => {
  const room = (4 / 25.4) * 72;

  it('keeps only the active part clear (up to the tolerance), dimming the header and the parent intro', () => {
    const bands = dimBands(map, 1, 'ex-1', 'a');
    expect(bands).toHaveLength(3);
    expect(bands[0]).toMatchObject({ top: 0 });
    expect(bands[0].bottom).toBeCloseTo(H - 700 - room);
    expect(bands[1].bottom).toBeCloseTo(H - 600 - room - REGION_TOLERANCE_PT);
    expect(bands[2].top).toBeCloseTo(H - 300 - room + REGION_TOLERANCE_PT);
  });

  it('always dims the points table, from its header row to the end of its page', () => {
    const bands = dimBands(map, 2, 'mc-a', '');
    expect(bands.at(-1)!.bottom).toBe(H);
    expect(bands.at(-1)!.top).toBeCloseTo(H - (150 + 2 * 15 + 4) + REGION_TOLERANCE_PT);
  });

  it('dims nothing on a writing page', () => {
    expect(dimBands(map, 3, 'ex-1', 'a')).toEqual([]);
  });
});

describe('ExerciseGuard', () => {
  it('asks to switch, keeps quiet for the cool-off after "stay", then asks again', () => {
    const guard = new ExerciseGuard();
    guard.setMap(map);
    const active = targets[0];
    const q = guard.question(2, at(2, 300), active, targets, 0);
    expect(q).toMatchObject({ kind: 'switch' });
    expect(q?.candidates.map((t) => t.exercise.id)).toEqual(['mc-a', 'mc-b']);
    guard.answered(q!, active, 0);
    expect(guard.question(2, at(2, 300), active, targets, GUARD_COOL_OFF_MS - 1)).toBeNull();
    expect(guard.question(2, at(2, 300), active, targets, GUARD_COOL_OFF_MS)).not.toBeNull();
  });

  it('asks which exercise on a writing page once per page and target, until reset', () => {
    const guard = new ExerciseGuard();
    guard.setMap(map);
    const q = guard.question(3, at(3, 400), targets[1], targets, 0);
    expect(q).toMatchObject({ kind: 'pick', page: 3 });
    guard.answered(q!, targets[1], 0);
    expect(guard.question(3, at(3, 400), targets[1], targets, 0)).toBeNull();
    guard.reset();
    expect(guard.question(3, at(3, 400), targets[1], targets, 0)).not.toBeNull();
  });

  it('never asks without areas', () => {
    const guard = new ExerciseGuard();
    guard.setMap(buildExerciseRegions(pages, {}));
    expect(guard.question(1, at(1, 400), targets[1], targets, 0)).toBeNull();
  });
});
