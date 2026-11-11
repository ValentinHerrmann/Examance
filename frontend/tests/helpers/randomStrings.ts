/** Deterministic random strings built from `alphabet` pieces, for differential tests of a rewritten regex against the old one. */
export function randomStrings(alphabet: readonly string[], count: number, maxPieces: number, seed = 1): string[] {
  let state = seed >>> 0 || 1;
  const next = (n: number): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) % n;
  };
  const out: string[] = [];
  for (let k = 0; k < count; k++) {
    let s = '';
    for (let p = next(maxPieces + 1); p > 0; p--) s += alphabet[next(alphabet.length)];
    out.push(s);
  }
  return out;
}

/** Milliseconds `fn` takes, for "stays linear on pathological input" checks with a generous bound. */
export function timeMs(fn: () => unknown): number {
  const start = performance.now();
  fn();
  return performance.now() - start;
}
