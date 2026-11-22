/** Maps between scan canvas pixels and template points for the exercise areas, and paints the focus dimming (issues #234, #235). Without an alignment the scan is taken as drawn at the template's geometry (`scanViewport` draws every page at A4). */

import { invertHomography, transformPoint, type Homography } from "./omrRegistration";
import { dimBands, type RegionMap } from "./exerciseRegions";
import { SCORE_BOX_SCAN_SCALE } from "./scoreBoxes";

/** The dimming outside the active exercise. */
const DIM_FILL = "rgba(15, 23, 42, 0.35)";

/** Template y (PDF points from the bottom) of a canvas point. */
export function canvasToTemplateY(H: Homography | null | undefined, x: number, y: number, pageHeightPt: number, canvasHeight: number): number {
  const inv = H ? invertHomography(H) : null;
  if (!inv) return pageHeightPt - (y * pageHeightPt) / canvasHeight;
  const [, ey] = transformPoint(inv, x, y);
  return pageHeightPt - ey / SCORE_BOX_SCAN_SCALE;
}

/** Canvas y of a template line (points from the page top), taken in the page's middle. */
export function templateTopToCanvasY(H: Homography | null | undefined, top: number, pageWidthPt: number, pageHeightPt: number, canvasHeight: number): number {
  if (!H) return (top * canvasHeight) / pageHeightPt;
  return transformPoint(H, (pageWidthPt / 2) * SCORE_BOX_SCAN_SCALE, top * SCORE_BOX_SCAN_SCALE)[1];
}

/** Paints the dimming of one page onto a cleared canvas; nothing for a page no exercise owns. */
export function paintFocus(
  ctx2d: CanvasRenderingContext2D,
  w: number,
  h: number,
  map: RegionMap,
  page: number,
  pageWidthPt: number,
  target: { exerciseId: string; partLabel: string },
  H: Homography | null | undefined
) {
  const pageHeightPt = map.pageHeights[page - 1];
  if (!pageHeightPt) return;
  ctx2d.fillStyle = DIM_FILL;
  for (const band of dimBands(map, page, target.exerciseId, target.partLabel)) {
    // Rounded alike on both sides (no overlap, no hairline); a band at the page's edge runs to the canvas edge, as the template's edges map a few pixels inside the scan.
    const y0 = band.top <= 0 ? 0 : Math.round(templateTopToCanvasY(H, band.top, pageWidthPt, pageHeightPt, h));
    const y1 = band.bottom >= pageHeightPt ? h : Math.round(templateTopToCanvasY(H, band.bottom, pageWidthPt, pageHeightPt, h));
    if (y1 <= y0) continue;
    ctx2d.fillRect(0, y0, w, y1 - y0);
  }
}
