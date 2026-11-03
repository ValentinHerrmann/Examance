/** The cut-off corner tab of printed student copies (issue #211): geometry mirrored from Schulaufgabe.sty (every exam's layout). Scans are never covered there: an uncut corner stays visible. A guillotine through a long-edge duplex or booklet stack cuts each page's outer top corner (top right on odd pages, top left on even ones); the sty keeps only that corner free and mirrors the header on even pages. */

import { CM } from '#lib/pdf/labelKit';

export const MM = CM / 10;

// Mirrored in Schulaufgabe.sty (`Schnitt`: \geometry top, header indents, \OmrFiducialAt corners 2 and 3); change both together.
/** The dashed cut line runs from TAB_TOP left of the corner on the top edge to TAB_SIDE down the right edge. */
export const TAB_TOP = 75 * MM;
export const TAB_SIDE = 20 * MM;
