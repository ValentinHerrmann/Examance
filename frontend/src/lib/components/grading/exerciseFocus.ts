/** The grading viewer's exercise areas (issues #234, #235): asks before a mark lands outside the active exercise and dims the scan outside it. Split out of ScanCanvasViewer.svelte; the component owns the canvases. */

import { get } from 'svelte/store';
import type { ExerciseRecord } from '#lib/db/schema';
import { gradingStore } from '#lib/grading/gradingStore';
import { activeTarget, gradingTargets, selectTarget } from '#lib/grading/gradingTargets';
import { buildExerciseRegions, offsetOf, type RegionMap } from '#lib/grading/exerciseRegions';
import { ExerciseGuard, type GuardAnswer, type GuardQuestion } from '#lib/grading/exerciseGuard';
import { canvasToTemplateY, paintFocus } from '#lib/grading/focusLayer';
import type { ScoreBoxContext } from '#lib/grading/scoreBoxes';
import type { ScoreBoxLayer } from '#lib/grading/scoreBoxLayer';
import type { Point } from './pointerInput';

export interface ExerciseFocusView {
  exercises(): ExerciseRecord[];
  focusCanvas(page: number): HTMLCanvasElement | undefined;
  overlayCanvas(page: number): HTMLCanvasElement | undefined;
  pageCount(): number;
  scoreLayer: ScoreBoxLayer;
  /** Shows the question; null when nobody can answer (then marks go to the active target unasked). */
  ask(question: GuardQuestion): Promise<GuardAnswer> | null;
}

export class ExerciseFocus {
  private ctx: ScoreBoxContext | null = null;
  private map: RegionMap | null = null;
  /** Scan pages of the current document; areas are known only when the scan holds every template page in its slot. */
  private scanPages = 0;
  private readonly guard = new ExerciseGuard();

  constructor(private readonly view: ExerciseFocusView) {}

  setContext(ctx: ScoreBoxContext | null) {
    this.ctx = ctx;
    this.map = ctx ? buildExerciseRegions(ctx.pages, ctx.positions) : null;
    this.updateGuard();
  }

  /** A new student's scan: no cool-off or page choices carried over, dimming on again. */
  newDocument(scanPages: number) {
    this.scanPages = scanPages;
    this.guard.reset();
    gradingStore.setFocusDimming(true);
    this.updateGuard();
  }

  private usableMap(): RegionMap | null {
    return this.ctx && this.map && this.scanPages >= this.ctx.pages.length ? this.map : null;
  }

  private updateGuard() {
    this.guard.setMap(this.usableMap());
  }

  /** The question for a new mark, or null to place it as is; resolves true once the chosen target is active. */
  askTarget(page: number, point: Point): Promise<boolean> | null {
    const map = this.usableMap();
    if (!map || !this.guard.active) return null;
    const template = this.ctx!.pages[page - 1];
    const overlay = this.view.overlayCanvas(page);
    let at = offsetOf(map, page, 0);
    if (template && overlay) {
      this.view.scoreLayer.ensureAligned(page);
      at = offsetOf(map, page, canvasToTemplateY(this.view.scoreLayer.homography(page), point.x, point.y, template.pageHeightPt, overlay.height));
    }
    const targets = gradingTargets(this.view.exercises());
    const state = get(gradingStore);
    const question = this.guard.question(page, at, activeTarget(targets, state.activeExerciseId, state.activePartLabel), targets, Date.now());
    const asking = question ? this.view.ask(question) : null;
    if (!question || !asking) return null;
    const submission = state.strokesSubmissionId;
    return asking.then((answer) => {
      // A student switch while the question was open drops the mark.
      if (get(gradingStore).strokesSubmissionId !== submission) return false;
      this.guard.answered(question, answer, Date.now());
      if (!answer) return false;
      selectTarget(answer);
      return true;
    });
  }

  /** Repaints the dimming of one page (cleared where no exercise owns it or dimming is off). */
  paint(page: number) {
    const canvas = this.view.focusCanvas(page);
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    const map = this.usableMap();
    const template = this.ctx?.pages[page - 1];
    const state = get(gradingStore);
    if (!map || !template || !state.focusDimming) return;
    const target = activeTarget(gradingTargets(this.view.exercises()), state.activeExerciseId, state.activePartLabel);
    if (!target) return;
    this.view.scoreLayer.ensureAligned(page);
    paintFocus(ctx2d, canvas.width, canvas.height, map, page, template.pageWidthPt, { exerciseId: target.exercise.id, partLabel: target.partLabel }, this.view.scoreLayer.homography(page));
  }

  paintAll() {
    for (let page = 1; page <= this.view.pageCount(); page++) this.paint(page);
  }
}
