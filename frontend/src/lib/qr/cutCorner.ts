/** The cut-off corner tab of printed student copies (issue #211): geometry mirrored from Schulaufgabe.sty (every exam's layout). Scans are never covered there: an uncut corner stays visible. A guillotine through a long-edge duplex or booklet stack cuts each page's outer top corner (top right on odd pages, top left on even ones); the sty keeps only that corner free and mirrors the header on even pages. */

import { CM } from '#lib/pdf/labelKit';

export const MM = CM / 10;

// Mirrored in Schulaufgabe.sty (`Schnitt`: \geometry top, header indents, \OmrFiducialAt corners 2 and 3); change both together.
/** The dashed cut line runs from TAB_TOP left of the corner on the top edge to TAB_SIDE down the right edge. */
export const TAB_TOP = 75 * MM;
export const TAB_SIDE = 20 * MM;

// Mirrored in Schulaufgabe.sty section 11 (issue #220); change both together.
/** The page code: 14 mm square, 75.5 mm from the cut side (inner side of the moved top marker), bottom edge 20 mm below the top. */
export const PAGE_CODE = { fromCutSide: 75.5 * MM, size: 14 * MM, bottomFromTop: 20 * MM } as const;
/** Booklets: the tinted strip along the fold, ending at the dashed cut line; text and fold-side markers start at FOLD_INSET (`\SA@foldinset`). */
export const FOLD_STRIP = 6 * MM;
export const FOLD_INSET = 8 * MM;

// Mirrored in Schulaufgabe.sty section 7 (`\OmrFiducialSize`, `\OmrFiducialInset`, `\SA@fidTopX/Y`); for the Layout step's sketch (issue #272).
/** Corner markers: 5 mm squares, the top ones 13.5 mm from the top, the cut-side one 47.5 mm from its side (67.5 mm with page codes). */
export const FIDUCIAL = { size: 5 * MM, inset: 6.5 * MM, top: 13.5 * MM, cutSide: 47.5 * MM, cutSideWithCodes: 67.5 * MM, foldSide: 9.5 * MM } as const;
// Mirrored in Schulaufgabe.sty section 11 (`\SA@stickerspot`).
/** Sticker spots: 35 mm square on the uncut side, 13.5 mm from that edge (16.5 mm on booklets), 3 mm from the top. */
export const STICKER_SPOT = { size: 35 * MM, fromSide: 13.5 * MM, fromSideBooklet: 16.5 * MM, top: 3 * MM } as const;
