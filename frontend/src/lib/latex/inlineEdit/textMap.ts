/** Positions between the text a PDF was compiled from and the text in the editor now (issue #347): edits between a compile and its PDF on screen are one region (typing, a paste), found as the common prefix and suffix. */

/** A position in a text: 1-based line, 0-based UTF-16 column. */
export interface TextPos {
  line: number;
  column: number;
}

/** The changed region: `from` is where both texts start to differ, `oldTo`/`newTo` where the common suffix starts in each (offsets). */
export interface TextChange {
  from: number;
  oldTo: number;
  newTo: number;
}

export function diffText(older: string, newer: string): TextChange | null {
  if (older === newer) return null;
  const max = Math.min(older.length, newer.length);
  let from = 0;
  while (from < max && older[from] === newer[from]) from++;
  let suffix = 0;
  while (suffix < max - from && older[older.length - 1 - suffix] === newer[newer.length - 1 - suffix]) suffix++;
  return { from, oldTo: older.length - suffix, newTo: newer.length - suffix };
}

export function offsetOf(text: string, pos: TextPos): number {
  let offset = 0;
  for (let line = 1; line < pos.line; line++) {
    const nl = text.indexOf('\n', offset);
    if (nl < 0) return text.length;
    offset = nl + 1;
  }
  const end = text.indexOf('\n', offset);
  return Math.min(offset + Math.max(0, pos.column), end < 0 ? text.length : end);
}

export function posOf(text: string, offset: number): TextPos {
  const before = text.slice(0, Math.max(0, Math.min(offset, text.length)));
  const nl = before.lastIndexOf('\n');
  return { line: before.split('\n').length, column: before.length - nl - 1 };
}

/** A position in the compiled text as a position in the current one: before the change it stays, after it it moves with the text, inside it goes to the end of the new text there. */
export function toCurrent(compiled: string, current: string, pos: TextPos): TextPos {
  const change = diffText(compiled, current);
  if (!change) return pos;
  const offset = offsetOf(compiled, pos);
  if (offset < change.from) return pos;
  return posOf(current, offset >= change.oldTo ? offset + change.newTo - change.oldTo : change.newTo);
}

/** A position in the current text as a position in the compiled one: inside text typed since the compile it goes to where that text starts to differ, after it it moves back. */
export function toCompiled(compiled: string, current: string, pos: TextPos): TextPos {
  const change = diffText(compiled, current);
  if (!change) return pos;
  const offset = offsetOf(current, pos);
  if (offset < change.from) return pos;
  return posOf(compiled, offset >= change.newTo ? offset - change.newTo + change.oldTo : change.oldTo);
}
