/** What a run observed of its editable inputs, and which of it an edit invalidates (pure, so it is tested without the engine). */

/** A read of [start, end) of the version `data`, or a lookup of whether the file existed. */
export type TraceEntry =
  | { kind: 'read'; path: string; data: Uint8Array; start: number; end: number; eof: boolean }
  | { kind: 'lookup'; path: string; existed: boolean };

/** The index of the first entry that `next` (the new content of `path`, absent = deleted) invalidates, or -1. `current` is the content the engine holds now. */
export function firstInvalidated(trace: readonly TraceEntry[], path: string, current: Uint8Array | undefined, next: Uint8Array | undefined): number {
  const diff = current && next ? firstDiff(current, next) : -1;
  for (let i = 0; i < trace.length; i++) {
    const e = trace[i];
    if (e.path !== path) continue;
    if (e.kind === 'lookup') {
      if (e.existed !== !!next) return i;
      continue;
    }
    if (!next) return i;
    if (e.eof && next.length > e.end) return i;
    // Entries before the last resume read older versions of the file: compare the bytes they saw, not the buffer.
    if (e.data === current) {
      if (diff >= 0 && e.end > diff) return i;
    } else if (!sameRange(e.data, next, e.start, e.end)) return i;
  }
  return -1;
}

function sameRange(a: Uint8Array, b: Uint8Array, start: number, end: number): boolean {
  if (b.length < end || a.length < end) return false;
  for (let i = start; i < end; i++) if (a[i] !== b[i]) return false;
  return true;
}

function firstDiff(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}
