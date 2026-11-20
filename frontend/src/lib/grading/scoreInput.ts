import { parseDecimal } from '#lib/utils/parseDecimal';

/** What a typed score field writes: `{ write: null }` for a blank field (clears the score), `{ write: n }` for a number within 0..max, and null to write nothing, so invalid or out-of-range text stays marked invalid and never clears the stored score (issue #299). */
export function scoreToWrite(raw: string | undefined, max: number): { write: number | null } | null {
  if ((raw ?? '').trim() === '') return { write: null };
  const value = parseDecimal(raw);
  return value !== null && value >= 0 && value <= max ? { write: value } : null;
}

/** A pasted score cell: null when empty, NaN for text that is not a number (the preview marks it invalid and the import skips it), else the number. */
export function pastedScore(cell: string): number | null {
  if (cell.trim() === '') return null;
  return parseDecimal(cell) ?? Number.NaN;
}
