/** The cut-off corner tab of printed student copies (issue #211): geometry mirrored from Schulaufgabe.sty `schnittecke`, and where the tab lies on a scan so ingest can cover it. The sty keeps both top corners of every page free, so a guillotine may cut a whole stack in any print mode. */

import type { OmrPageTemplate } from '#lib/db/schema';
import type { OmrDetectionParams } from '#lib/grading/omrSettings';
import { pdfPointToExpectedPixel, registerPage, transformPoint } from '#lib/grading/omrRegistration';
import { A4, CM } from '#lib/pdf/labelKit';

export const MM = CM / 10;

// Mirrored in Schulaufgabe.sty (`Schnitt`: \geometry top, header indents, \OmrFiducialAt corners 2 and 3); change both together.
/** The dashed cut line runs from TAB_TOP left of the corner on the top edge to TAB_SIDE down the right edge. */
export const TAB_TOP = 75 * MM;
export const TAB_SIDE = 20 * MM;
/** Perpendicular room beyond the line for an imprecise cut; the sty keeps this whole zone (86.6 × 23.1 mm) free in both top corners. */
export const TAB_TOLERANCE = 3 * MM;

const HYPOTENUSE = Math.hypot(TAB_TOP, TAB_SIDE);
/** Legs of the reserved triangle: the cut line moved outward by the tolerance. */
export const ZONE_TOP = TAB_TOP + (TAB_TOLERANCE * HYPOTENUSE) / TAB_SIDE;
export const ZONE_SIDE = TAB_SIDE + (TAB_TOLERANCE * HYPOTENUSE) / TAB_TOP;

type Point = [number, number];

/** The reserved triangle at page 1's top-right corner, in PDF points (origin bottom-left). */
export function zonePolygon(): Point[] {
  return [
    [A4.width - ZONE_TOP, A4.height],
    [A4.width, A4.height],
    [A4.width, A4.height - ZONE_SIDE],
  ];
}

const FIDUCIAL_INSET = 5 * MM;
const FIDUCIAL_SIZE = 8 * MM;
/** The top pair under `schnittecke`, on every page: this far from each side and from the top edge (`\SA@fidTopX`, `\SA@fidTopY`). */
export const TOP_FIDUCIAL_SIDE = 46 * MM;
export const TOP_FIDUCIAL_TOP = 12 * MM;

/** A page as the scanner sees it: the bottom fiducials in the corners, the top pair moved inward beside the header row, outside both zones. */
export function cutCornerTemplate(): OmrPageTemplate {
  const right = A4.width - FIDUCIAL_INSET - FIDUCIAL_SIZE;
  const top = A4.height - TOP_FIDUCIAL_TOP - FIDUCIAL_SIZE;
  const at = (corner: 0 | 1 | 2 | 3, x: number, y: number) => ({ corner, rect: [x, y, x + FIDUCIAL_SIZE, y + FIDUCIAL_SIZE] as [number, number, number, number] });
  return {
    pageIndex: 0,
    pageWidthPt: A4.width,
    pageHeightPt: A4.height,
    fiducials: [
      at(0, FIDUCIAL_INSET, FIDUCIAL_INSET),
      at(1, right, FIDUCIAL_INSET),
      at(2, A4.width - TOP_FIDUCIAL_SIDE - FIDUCIAL_SIZE, top),
      at(3, TOP_FIDUCIAL_SIDE, top),
    ],
    bubbles: [],
  };
}

/** The reserved zone of a rendered first page in image pixels, grown to the image edges so a skewed or cut page is hidden as well. Always returned: the zone is printed blank apart from the tab, so covering a cut corner costs nothing. */
export function cornerCoverPolygon(imageData: ImageData, scanScale: number, params: OmrDetectionParams): Point[] {
  const { width, height } = imageData;
  const { H } = registerPage(imageData, cutCornerTemplate(), scanScale, params);
  const toPixel = ([x, y]: Point): Point => {
    const expected = pdfPointToExpectedPixel(x, y, scanScale, A4.height);
    // Unaligned: the nominal zone, scaled to the image (privacy first).
    return H ? transformPoint(H, ...expected) : [(x / A4.width) * width, ((A4.height - y) / A4.height) * height];
  };
  const [left, , down] = zonePolygon().map(toPixel);
  // From the zone's top-left point along the top edge to the right edge, then down to the zone's lower point.
  return [
    [Math.max(0, left[0]), 0],
    [width, 0],
    [width, Math.min(height, down[1])],
    [Math.min(width, down[0]), Math.min(height, down[1])],
    [Math.max(0, left[0]), Math.max(0, left[1])],
  ];
}
