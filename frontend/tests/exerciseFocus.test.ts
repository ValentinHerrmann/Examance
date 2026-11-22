import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OmrPageTemplate, OmrScoreBoxRect } from '../src/lib/db/schema';
import { ExerciseFocus, type ExerciseFocusView } from '../src/lib/components/grading/exerciseFocus';
import { gradingStore } from '../src/lib/grading/gradingStore';
import type { ScoreBoxContext } from '../src/lib/grading/scoreBoxes';

const H = 842;
const box = (position: number, top: number): OmrScoreBoxRect => ({ box: 'task', position, rect: [500, top - 15, 550, top] });
const page = (i: number, scoreBoxes: OmrScoreBoxRect[]): OmrPageTemplate => ({ pageIndex: i, pageWidthPt: 595, pageHeightPt: H, fiducials: [], bubbles: [], scoreBoxes });
// Exercise 1 on page 1, exercise 2 on page 2.
const ctx = { pages: [page(0, [box(1, 700)]), page(1, [box(2, 700)])], positions: { 1: ['ex-1'], 2: ['ex-2'] }, params: {} } as unknown as ScoreBoxContext;
const exercises = [{ id: 'ex-1', maxPoints: 5 }, { id: 'ex-2', maxPoints: 5 }] as never[];

/** A pane of 1000 px showing pages of 1000 px stacked without gaps; canvases appear once `ready`. */
function fakeView() {
  const viewport = { scrollTop: 0, clientHeight: 1000, scrollTo: vi.fn(({ top }: { top: number }) => (viewport.scrollTop = top)) };
  const canvas = { height: 1000, getBoundingClientRect: () => ({ height: 1000 }) } as unknown as HTMLCanvasElement;
  const state = { ready: false };
  const view: ExerciseFocusView = {
    exercises: () => exercises,
    focusCanvas: () => (state.ready ? canvas : undefined),
    overlayCanvas: () => undefined,
    pageCount: () => 2,
    scoreLayer: { homography: () => null, ensureAligned: () => {} } as never,
    viewport: () => viewport as unknown as HTMLElement,
    notice: () => undefined,
    pageTop: (p) => (state.ready ? (p - 1) * 1000 : null),
    ask: () => null,
  };
  return { view, viewport, state };
}

describe('ExerciseFocus.follow', () => {
  beforeEach(() => gradingStore.setActivePart('ex-2', ''));

  it('scrolls to a target picked before the scan loaded (deep link), once it is ready', () => {
    const { view, viewport, state } = fakeView();
    const focus = new ExerciseFocus(view);
    focus.follow();
    focus.setContext(ctx);
    focus.follow();
    focus.newDocument(2);
    focus.follow();
    expect(viewport.scrollTo).not.toHaveBeenCalled();
    state.ready = true;
    focus.follow();
    expect(viewport.scrollTo).toHaveBeenCalledTimes(1);
    expect(viewport.scrollTop).toBeGreaterThan(1000);
    focus.follow();
    expect(viewport.scrollTo).toHaveBeenCalledTimes(1);
  });

  it('jumps again on the next scan with the same target', () => {
    const { view, viewport, state } = fakeView();
    state.ready = true;
    const focus = new ExerciseFocus(view);
    focus.setContext(ctx);
    focus.newDocument(2);
    focus.follow();
    viewport.scrollTop = 0;
    focus.newDocument(2);
    focus.follow();
    expect(viewport.scrollTo).toHaveBeenCalledTimes(2);
  });
});
