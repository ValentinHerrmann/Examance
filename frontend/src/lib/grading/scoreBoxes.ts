/** Fills the printed score boxes on the scan (issue #187): exercise and part boxes, the bottom table's cells, Σ and grade. A non-persisted overlay like omrOverlay.ts, shared by the grading viewer and the graded-PDF export. */

import { calculateGradeDetail } from "#lib/analytics/gradingKey";
import { loadOmrTemplateEncrypted } from "#lib/db/dbEncryption";
import type { GradingKeyConfig, OmrPageTemplate } from "#lib/db/schema";
import { DEFAULT_OMR_PARAMS } from "./omrSettings";
import { pdfRectToNormalized, registerPage, type Homography } from "./omrRegistration";
import { computeOmrTemplateHash, loadExamCompileContext, OMR_TEMPLATE_VERSION } from "./omrTemplatePrep";
import { formatPoints } from "./omrOverlay";
import { scoreBoxKey } from "./omrUri";
import type { PartScores } from "./partScores";

/** Score rendering at the viewer's and export's raster scale (pdf.js scale 2). */
export const SCORE_BOX_SCAN_SCALE = 2;
const INK = "#ef4444";

export interface ScoreBoxContext {
  pages: OmrPageTemplate[];
  /** Exam position -> exercise ids (OmrTemplatePayload.positions). */
  positions: Record<number, string[]>;
  gradingKey?: GradingKeyConfig;
}

/** The exam's score-box layout, or null when there is none or the template no longer matches the exam (the printed sheet would differ). Never compiles. */
export async function loadScoreBoxContext(examId: string, key: CryptoKey | null): Promise<ScoreBoxContext | null> {
  try {
    const stored = await loadOmrTemplateEncrypted(examId, key);
    const payload = stored?.payload;
    if (!payload || (payload.version ?? 1) < OMR_TEMPLATE_VERSION || !payload.positions) return null;
    if (!payload.pages.some((p) => (p.scoreBoxes?.length ?? 0) > 0)) return null;
    const ctx = await loadExamCompileContext(examId, key);
    if (!ctx || (await computeOmrTemplateHash(ctx)) !== stored!.record.exercisesHash) return null;
    return { pages: payload.pages, positions: payload.positions, gradingKey: ctx.exam.gradingKey };
  } catch (err) {
    console.warn("[scoreBoxes] layout unavailable:", err);
    return null;
  }
}

export interface ScoreBoxInput {
  positions: Record<number, string[]>;
  /** Every exercise of the exam with its maximum, for Σ and the grade. */
  exercises: { id: string; maxPoints: number }[];
  scoreInputs: Record<string, number | null | undefined>;
  partInputs: Record<string, PartScores | undefined>;
  gradingKey?: GradingKeyConfig;
}

const isNum = (v: unknown): v is number => typeof v === "number" && !Number.isNaN(v);
const round = (v: number) => Math.round(v * 100) / 100;

/** Text per score-box key (`scoreBoxKey`). A box stays empty until everything it sums is graded. */
export function buildScoreBoxValues(input: ScoreBoxInput): Map<string, string> {
  const { positions, exercises, scoreInputs, partInputs, gradingKey } = input;
  const values = new Map<string, string>();
  for (const [pos, ids] of Object.entries(positions)) {
    const position = Number(pos);
    const scores = ids.map((id) => scoreInputs[id]);
    if (ids.length > 0 && scores.every(isNum)) {
      const text = formatPoints(round(scores.reduce((s, v) => s + v, 0)));
      values.set(scoreBoxKey({ box: "task", position }), text);
      values.set(scoreBoxKey({ box: "cell", position }), text);
    }
    for (const id of ids) {
      for (const [part, v] of Object.entries(partInputs[id] ?? {})) {
        if (isNum(v)) values.set(scoreBoxKey({ box: "part", position, part }), formatPoints(v));
      }
    }
  }
  const all = exercises.map((ex) => scoreInputs[ex.id]);
  if (exercises.length > 0 && all.every(isNum)) {
    const total = round(all.reduce((s, v) => s + v, 0));
    values.set("sum", formatPoints(total));
    const max = exercises.reduce((s, ex) => s + (ex.maxPoints || 0), 0);
    const grade = calculateGradeDetail(total, max, gradingKey)?.grade;
    if (grade) values.set("grade", grade);
  }
  return values;
}

/** Template-to-scan mapping of one rendered page; null when the page cannot be aligned safely (fewer than 3 fiducials, no template page). */
export function registerScorePage(ctx: ScoreBoxContext, page: number, image: ImageData): Homography | null {
  const template = ctx.pages[page - 1];
  if (!template?.scoreBoxes?.length) return null;
  return registerPage(image, template, SCORE_BOX_SCAN_SCALE, DEFAULT_OMR_PARAMS).H;
}

/** Writes the values into the boxes of one page; `w`/`h` are the raster size the page was registered at. */
export function drawScoreBoxesForPage(
  ctx2d: CanvasRenderingContext2D,
  w: number,
  h: number,
  template: OmrPageTemplate | undefined,
  H: Homography | null,
  values: Map<string, string>
) {
  if (!template?.scoreBoxes || !H || values.size === 0) return;
  ctx2d.save();
  ctx2d.fillStyle = INK;
  ctx2d.textAlign = "center";
  ctx2d.textBaseline = "middle";
  for (const box of template.scoreBoxes) {
    const text = values.get(scoreBoxKey(box));
    if (!text) continue;
    const [x0, y0, x1, y1] = pdfRectToNormalized(H, box.rect, SCORE_BOX_SCAN_SCALE, template.pageHeightPt, w, h);
    const bw = (x1 - x0) * w;
    const bh = (y1 - y0) * h;
    let size = Math.max(10, bh * 0.85);
    ctx2d.font = `bold ${Math.round(size)}px sans-serif`;
    const textW = ctx2d.measureText(text).width;
    if (textW > bw * 0.95) {
      size = Math.max(8, (size * bw * 0.95) / textW);
      ctx2d.font = `bold ${Math.round(size)}px sans-serif`;
    }
    ctx2d.fillText(text, ((x0 + x1) / 2) * w, ((y0 + y1) / 2) * h);
  }
  ctx2d.restore();
}
