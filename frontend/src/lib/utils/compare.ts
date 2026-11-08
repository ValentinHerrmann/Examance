/** Code-unit order, identical to the default `sort()` for strings; for byte-stable outputs (hashes, fingerprints, cache keys), never for lists people read (use `compareText`). */
export const compareCodeUnits = (a: string, b: string): number => Number(a > b) - Number(a < b);
