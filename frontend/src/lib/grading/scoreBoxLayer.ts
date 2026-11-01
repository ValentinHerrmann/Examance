/** The grading viewer's score-box overlay (issue #187): aligns a rendered scan page with the template in the OMR worker, lazily (only once a box on that page has a value) and once per page and scan, then draws the values. */

import type { ExerciseRecord } from "#lib/db/schema";
import type { OmrRegisterRequest, OmrRegisterResponse } from "#lib/workers/omrWorker";
import { spawnOmrWorker } from "#lib/workers/spawn";
import type { Homography } from "./omrRegistration";
import type { PartScores } from "./partScores";
import { buildScoreBoxValues, drawScoreBoxesForPage, registerScorePage, SCORE_BOX_SCAN_SCALE, type ScoreBoxContext } from "./scoreBoxes";

export class ScoreBoxLayer {
  private ctx: ScoreBoxContext | null = null;
  private pageCount = 0;
  private readonly rendered = new Set<number>();
  private readonly aligned = new Map<number, Homography | null>();
  private readonly pending = new Set<number>();
  /** Bumped per scan and layout, so a late answer for the previous one is dropped. */
  private generation = 0;
  private worker: Worker | null = null;
  private nextId = 0;
  private readonly waiting = new Map<number, (h: Homography | null) => void>();

  constructor(
    private readonly scanCanvas: (page: number) => HTMLCanvasElement | undefined,
    private readonly onAligned: (page: number) => void
  ) {}

  setContext(ctx: ScoreBoxContext | null) {
    this.ctx = ctx;
    this.forgetAlignment();
  }

  /** A new scan is being shown. */
  newDocument(pageCount: number) {
    this.pageCount = pageCount;
    this.rendered.clear();
    this.forgetAlignment();
  }

  markRendered(page: number) {
    this.rendered.add(page);
  }

  draw(
    ctx2d: CanvasRenderingContext2D,
    page: number,
    w: number,
    h: number,
    exercises: ExerciseRecord[],
    scores: { scoreInputs: Record<string, number | null>; partInputs: Record<string, PartScores> }
  ) {
    const ctx = this.ctx;
    // Only a scan with the template's page count is the printed booklet page for page.
    if (!ctx || this.pageCount !== ctx.pages.length || !ctx.pages[page - 1]?.scoreBoxes?.length) return;
    const values = buildScoreBoxValues({ ...ctx, exercises, ...scores });
    if (values.size === 0) return;
    if (!this.aligned.has(page)) {
      this.align(page);
      return;
    }
    drawScoreBoxesForPage(ctx2d, w, h, ctx.pages[page - 1], this.aligned.get(page)!, values);
  }

  destroy() {
    this.worker?.terminate();
    this.worker = null;
    this.waiting.clear();
  }

  private forgetAlignment() {
    this.generation++;
    this.aligned.clear();
    this.pending.clear();
  }

  private align(page: number) {
    const ctx = this.ctx!;
    const canvas = this.scanCanvas(page);
    if (!canvas || !this.rendered.has(page) || this.pending.has(page)) return;
    this.pending.add(page);
    const generation = this.generation;
    const imageData = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
    void this.register(ctx, page, imageData).then((h) => {
      if (generation !== this.generation) return;
      this.pending.delete(page);
      this.aligned.set(page, h);
      if (h) this.onAligned(page);
    });
  }

  private register(ctx: ScoreBoxContext, page: number, imageData: ImageData): Promise<Homography | null> {
    if (typeof Worker === "undefined") return Promise.resolve(registerScorePage(ctx, page, imageData));
    this.worker ??= this.startWorker();
    const id = ++this.nextId;
    const request: OmrRegisterRequest = {
      type: "REGISTER_PAGE",
      id,
      imageData,
      pageTemplate: ctx.pages[page - 1],
      scanScale: SCORE_BOX_SCAN_SCALE,
      params: ctx.params,
    };
    return new Promise((resolve) => {
      this.waiting.set(id, resolve);
      this.worker!.postMessage(request, [imageData.data.buffer]);
    });
  }

  private startWorker(): Worker {
    const worker = spawnOmrWorker();
    worker.onmessage = (event: MessageEvent<OmrRegisterResponse>) => {
      const resolve = this.waiting.get(event.data.id);
      this.waiting.delete(event.data.id);
      resolve?.(event.data.homography ?? null);
    };
    // A dead worker leaves the boxes empty rather than blocking the viewer.
    worker.onerror = () => {
      for (const resolve of this.waiting.values()) resolve(null);
      this.waiting.clear();
    };
    return worker;
  }
}
