const DECIMAL = /^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

/** A typed decimal as a number: "5", "5,5", "5.5", ",5" or " 5 "; null for blank or anything that is not wholly a number ("5abc", "1e3", "0x10"), so every points and minutes field accepts the same input (issue #299). Range checks stay with the caller. */
export function parseDecimal(raw: string | null | undefined): number | null {
  const text = (raw ?? '').trim();
  return DECIMAL.test(text) ? Number(text.replace(',', '.')) : null;
}
