/** The cut-off strip of printed student copies (issue #211): geometry mirrored from Schulaufgabe.sty `schnittstreifen`, and where an uncut strip lies on a scan so ingest can cover it. */

import type { OmrPageTemplate } from '#lib/db/schema';
import type { OmrDetectionParams } from '#lib/grading/omrSettings';
import { bubbleBBoxInImage, registerPage } from '#lib/grading/omrRegistration';
import { A4, CM } from '#lib/pdf/labelKit';

/** Free band on top of every page (`\SchnittBand` in Schulaufgabe.sty); the exam content starts below it. */
export const CUT_BAND = 3 * CM;
/** The dashed cut line, measured from the top edge: the strip text sits above it with room to spare, and 11 mm of blank band below it absorb an imprecise cut. */
export const CUT_LINE = 1.9 * CM;
/** A scan is covered from its top edge down to this depth: the whole strip plus the blank tolerance, never the header below the band. */
export const COVER_DEPTH = CUT_BAND - 0.2 * CM;

const FIDUCIAL_INSET = 0.5 * CM;
const FIDUCIAL_SIZE = 0.8 * CM;

/** Page 1 as the scanner sees it with the band: only the four corner fiducials (`\OmrFiducialAt`), the top two moved down by the band. */
export function cutStripTemplate(): OmrPageTemplate {
  const right = A4.width - FIDUCIAL_INSET - FIDUCIAL_SIZE;
  const top = A4.height - CUT_BAND - FIDUCIAL_INSET - FIDUCIAL_SIZE;
  const at = (corner: 0 | 1 | 2 | 3, x: number, y: number) => ({ corner, rect: [x, y, x + FIDUCIAL_SIZE, y + FIDUCIAL_SIZE] as [number, number, number, number] });
  return {
    pageIndex: 0,
    pageWidthPt: A4.width,
    pageHeightPt: A4.height,
    fiducials: [at(0, FIDUCIAL_INSET, FIDUCIAL_INSET), at(1, right, FIDUCIAL_INSET), at(2, right, top), at(3, FIDUCIAL_INSET, top)],
    bubbles: [],
  };
}

/** Below this height/width ratio a page is shorter than A4 (29.7 / 21 = 1.414; cut at the line 1.32), so its strip is gone. */
const UNCUT_MIN_RATIO = 1.39;

/** Pixel rows [0, bottom) of a rendered first page that may still show the strip, or null when it was cut off. Full width, so a skewed scan hides it as well. */
export function stripCoverBottom(imageData: ImageData, scanScale: number, params: OmrDetectionParams): number | null {
  const { width, height } = imageData;
  const { H } = registerPage(imageData, cutStripTemplate(), scanScale, params);
  let bottom: number;
  if (H) {
    bottom = Math.ceil(bubbleBBoxInImage(H, [0, A4.height - COVER_DEPTH, A4.width, A4.height], scanScale, A4.height).maxY);
  } else {
    // Unaligned: privacy first, so a full-height page is treated as uncut.
    if (height / width < UNCUT_MIN_RATIO) return null;
    bottom = Math.ceil((COVER_DEPTH / A4.height) * height);
  }
  bottom = Math.min(height, bottom);
  return bottom > 0 ? bottom : null;
}
