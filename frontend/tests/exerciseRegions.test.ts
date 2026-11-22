import { describe, expect, it } from 'vitest';
import type { OmrPageTemplate, OmrScoreBoxRect } from '../src/lib/db/schema';
import { buildExerciseRegions, dimBands, offsetOf, regionAccepts, regionAt } from '../src/lib/grading/exerciseRegions';
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

describe('regionAccepts', () => {
  const accepts = (p: number, y: number, id: string, part: string) => regionAccepts(regionAt(map, at(p, y))!, id, part);

  it('accepts the intro for every part, and the MC group for each member', () => {
    expect(accepts(1, 650, 'ex-1', 'b')).toBe(true);
    expect(accepts(2, 300, 'mc-b', '')).toBe(true);
    expect(accepts(1, 400, 'ex-1', 'b')).toBe(false);
  });

  it('switches exactly at the border, with no overlap', () => {
    const border = 300 + (4 / 25.4) * 72;
    expect(accepts(1, border + 1, 'ex-1', 'a')).toBe(true);
    expect(accepts(1, border - 1, 'ex-1', 'a')).toBe(false);
  });
});

describe('dimBands', () => {
  it('leaves the active area clear and dims sibling parts lightly, starting exactly at the border', () => {
    const bands = dimBands(map, 1, 'ex-1', 'a');
    expect(bands).toHaveLength(1);
    expect(bands[0].level).toBe(1);
    expect(bands[0].top).toBeCloseTo(H - 300 - (4 / 25.4) * 72);
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
