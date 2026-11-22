/** The grading viewer's exercise areas (issues #234, #235): asks before a mark lands outside the active exercise and dims the scan outside it. Split out of ScanCanvasViewer.svelte; the component owns the canvases. */

import { get } from 'svelte/store';
import type { ExerciseRecord } from '#lib/db/schema';
import { gradingStore } from '#lib/grading/gradingStore';
import { activeTarget, gradingTargets, selectTarget } from '#lib/grading/gradingTargets';
import { buildExerciseRegions, offsetOf, pageAndTop, targetRegion, type RegionMap } from '#lib/grading/exerciseRegions';
import { ExerciseGuard, GUARD_COOL_OFF_MS, type GuardAnswer, type GuardQuestion } from '#lib/grading/exerciseGuard';
import { translate } from '#lib/i18n';
import type { Notice } from './CanvasNotice.svelte';
import { canvasToTemplateY, paintFocus, templateTopToCanvasY } from '#lib/grading/focusLayer';
import type { ScoreBoxContext } from '#lib/grading/scoreBoxes';
import type { ScoreBoxLayer } from '#lib/grading/scoreBoxLayer';
import type { Point } from './pointerInput';

export interface ExerciseFocusView {
  exercises(): ExerciseRecord[];
  focusCanvas(page: number): HTMLCanvasElement | undefined;
  overlayCanvas(page: number): HTMLCanvasElement | undefined;
  pageCount(): number;
  scoreLayer: ScoreBoxLayer;
  viewport(): HTMLElement | undefined;
  /** The notice floating over the scan (the cool-off banner). */
  notice(): { show(n: Notice): void; hide(): void } | undefined;
  /** Scroll offset of a page's top in the viewport. */
  pageTop(page: number): number | null;
  /** Shows the question; null when nobody can answer (then marks go to the active target unasked). */
  ask(question: GuardQuestion): Promise<GuardAnswer> | null;
}

export class ExerciseFocus {
  private ctx: ScoreBoxContext | null = null;
  private map: RegionMap | null = null;
  /** Scan pages of the current document; areas are known only when the scan holds every template page in its slot. */
  private scanPages = 0;
  private readonly guard = new ExerciseGuard();
  /** The next target change came from answering a question about a mark: the scan stays where the teacher is writing. */
  private stayPut = false;
  /** Target `follow` last saw, so the focus switch alone never scrolls. */
  private followed = '';

  constructor(private readonly view: ExerciseFocusView) {}

  setContext(ctx: ScoreBoxContext | null) {
    this.ctx = ctx;
    this.map = ctx ? buildExerciseRegions(ctx.pages, ctx.positions) : null;
    this.updateGuard();
  }

  /** A new student's scan: no cool-off or page choices carried over, dimming on again. */
  newDocument(scanPages: number) {
    this.scanPages = scanPages;
    this.endCoolOff();
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
      if (this.guard.answered(question, answer, Date.now())) this.showCoolOff();
      if (!answer) return false;
      const now = get(gradingStore);
      this.stayPut = answer.exercise.id !== now.activeExerciseId || answer.partLabel !== now.activePartLabel;
      selectTarget(answer);
      return true;
    });
  }

  /** The banner while questions pause after "stay": a draining bar and a button to ask again at once. */
  private showCoolOff() {
    const end = () => this.guard.endCoolOff();
    this.view.notice()?.show({
      message: translate('grading.regionGuard.paused'),
      timeoutMs: GUARD_COOL_OFF_MS,
      progress: true,
      action: { label: translate('grading.regionGuard.resume'), onClick: end },
      onClose: end,
    });
  }

  /** Ends a running cool-off together with its banner (a new student). */
  private endCoolOff() {
    if (this.guard.isQuiet(Date.now())) this.view.notice()?.hide();
    this.guard.endCoolOff();
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

  /** Scrolls the active target's area into view unless its start is already on screen (a target picked in the score list or the stepper). */
  follow() {
    const state = get(gradingStore);
    const key = `${state.activeExerciseId}#${state.activePartLabel}`;
    if (key === this.followed) return;
    this.followed = key;
    if (this.stayPut) {
      this.stayPut = false;
      return;
    }
    const map = this.usableMap();
    const viewport = this.view.viewport();
    if (!map || !viewport) return;
    const target = activeTarget(gradingTargets(this.view.exercises()), state.activeExerciseId, state.activePartLabel);
    const region = target ? targetRegion(map, target.exercise.id, target.partLabel) : null;
    if (!region) return;
    const { page, top } = pageAndTop(region.start);
    const canvas = this.view.focusCanvas(page);
    const template = this.ctx?.pages[page - 1];
    const pageTop = this.view.pageTop(page);
    if (!canvas || !template || pageTop === null || canvas.height === 0) return;
    const shown = canvas.getBoundingClientRect().height / canvas.height;
    const y = pageTop + templateTopToCanvasY(this.view.scoreLayer.homography(page), top, template.pageWidthPt, template.pageHeightPt, canvas.height) * shown;
    // Already in the upper part of the pane: no jump.
    if (y >= viewport.scrollTop && y <= viewport.scrollTop + viewport.clientHeight * 0.6) return;
    viewport.scrollTo({ top: Math.max(0, y) });
  }

  paintAll() {
    for (let page = 1; page <= this.view.pageCount(); page++) this.paint(page);
  }
}
