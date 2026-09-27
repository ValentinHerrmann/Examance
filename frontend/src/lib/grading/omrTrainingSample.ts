/**
 * Builds anonymous training samples (opt-in donation) from one teacher-verified MC question.
 *
 * A sample is a small grayscale crop of one answer box plus its redo zone, the teacher's final
 * decision as label, and the detector's own reading/features. It deliberately carries no exam,
 * submission, exercise, pupil or teacher identifier and no timestamp, and the crop is kept tight
 * (the printed option text starts ~2 mm right of the box and is left out).
 * Must match backend/app/schemas/training.py.
 */
import type { OmrScoreMeta } from '$lib/db/schema';
import { renderScanPage } from './mcCropRender';
import { OMR_ALGORITHM_VERSION } from './omrSettings';
import type { OmrShapeReason } from './omrShape';

export const OMR_CROP_WIDTH = 80;
export const OMR_CROP_HEIGHT = 48;
export const OMR_SAMPLE_SCHEMA_VERSION = 1;

/** Crop window around the box, in box sizes: redo zone (~0.9) plus gap on the left. */
const CROP_LEFT = 1.2;
const CROP_RIGHT = 0.4;
const CROP_VERTICAL = 0.28;
const RENDER_SCALE = 3;

export interface OmrTrainingSampleIn {
  schema_version: 1;
  algorithm_version: number;
  label_selected: boolean;
  detected_state: 'blank' | 'ambiguous' | 'marked' | 'undone' | 'redone';
  provisional: boolean | null;
  /** The other algorithm's verdict (shadow run), when recorded. */
  alt_state: 'blank' | 'ambiguous' | 'marked' | 'undone' | 'redone' | null;
  reasons: OmrShapeReason[];
  has_redo_zone: boolean;
  crop_b64: string;
  features: {
    fill: number;
    redo_ratio: number | null;
    min_cell_fill: number;
    cell_evenness: number;
    ring_fill: number;
    spill_excess: number | null;
    ink_contrast: number;
    stroke_span: number;
    stroke_frac: number;
    redo_near_frac: number | null;
    snap_dx: number;
    snap_dy: number;
    border_found: boolean;
    bg: number;
  };
}

/** Stable key of a verified selection — lets a later re-donation detect a changed label. */
export function donationLabel(selectedOptions: number[]): string {
  return [...selectedOptions].sort((a, b) => a - b).join(',');
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/**
 * Samples for every box of one verified question, or [] when the detection predates the
 * features a sample needs (algorithm < 3) or its page cannot be read.
 */
export async function buildTrainingSamples(
  scanPdfBytes: Uint8Array,
  omrMeta: OmrScoreMeta,
  selectedOptions: number[]
): Promise<OmrTrainingSampleIn[]> {
  const detections = omrMeta.detections;
  if (!detections) return [];
  // `algorithm_version` names the *feature* version: v3 runs and every run since (v2 or v4
  // deciding) store the v3/v4 `measureBox` features; older runs have none and are skipped below.
  const featureVersion = omrMeta.run?.algorithmVersion === 3 ? 3 : OMR_ALGORITHM_VERSION;
  const usable = detections.bubbles.filter((b) => b.shape?.strokeSpan !== undefined && b.fillRatio !== undefined);
  if (usable.length === 0) return [];

  const page = await renderScanPage(scanPdfBytes, detections.pageIndex, RENDER_SCALE);
  const out = document.createElement('canvas');
  out.width = OMR_CROP_WIDTH;
  out.height = OMR_CROP_HEIGHT;
  const octx = out.getContext('2d', { willReadFrequently: true });
  if (!octx) return [];
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = 'high';

  const selected = new Set(selectedOptions);
  const samples: OmrTrainingSampleIn[] = [];
  for (const b of usable) {
    const shape = b.shape!;
    const [x0, y0, x1, y1] = b.rect;
    const bw = (x1 - x0) * page.width;
    const bh = (y1 - y0) * page.height;
    const sx = clamp(x0 * page.width - CROP_LEFT * bw, 0, page.width);
    const sy = clamp(y0 * page.height - CROP_VERTICAL * bh, 0, page.height);
    const ex = clamp(x1 * page.width + CROP_RIGHT * bw, 0, page.width);
    const ey = clamp(y1 * page.height + CROP_VERTICAL * bh, 0, page.height);
    if (ex - sx < 4 || ey - sy < 4) continue;

    octx.fillStyle = '#fff';
    octx.fillRect(0, 0, OMR_CROP_WIDTH, OMR_CROP_HEIGHT);
    octx.drawImage(page, sx, sy, ex - sx, ey - sy, 0, 0, OMR_CROP_WIDTH, OMR_CROP_HEIGHT);
    const rgba = octx.getImageData(0, 0, OMR_CROP_WIDTH, OMR_CROP_HEIGHT).data;
    const grayBytes = new Uint8Array(OMR_CROP_WIDTH * OMR_CROP_HEIGHT);
    for (let i = 0, p = 0; p < grayBytes.length; i += 4, p++) {
      grayBytes[p] = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
    }

    samples.push({
      schema_version: OMR_SAMPLE_SCHEMA_VERSION,
      algorithm_version: featureVersion,
      label_selected: selected.has(b.optionIndex),
      detected_state: b.detectedState ?? b.state,
      provisional: b.provisional ?? null,
      alt_state: b.alt?.state ?? null,
      reasons: b.reasons ?? [],
      has_redo_zone: b.redoRatio !== undefined,
      crop_b64: toBase64(grayBytes),
      features: {
        fill: clamp(b.fillRatio ?? 0, 0, 1),
        redo_ratio: b.redoRatio ?? null,
        min_cell_fill: clamp(shape.minCellFill, 0, 1),
        cell_evenness: clamp(shape.cellEvenness, 0, 1),
        ring_fill: clamp(shape.ringFill, 0, 1),
        spill_excess: shape.spillExcess !== undefined ? clamp(shape.spillExcess, -1, 1) : null,
        ink_contrast: clamp(shape.inkContrast, 0, 1),
        stroke_span: clamp(shape.strokeSpan, 0, 1),
        stroke_frac: clamp(shape.strokeFrac, 0, 1),
        redo_near_frac: shape.redoNearFrac ?? null,
        snap_dx: clamp(shape.snapDx, -1, 1),
        snap_dy: clamp(shape.snapDy, -1, 1),
        border_found: shape.borderFound,
        bg: Math.round(clamp(shape.bg, 0, 255)),
      },
    });
  }
  return samples;
}
