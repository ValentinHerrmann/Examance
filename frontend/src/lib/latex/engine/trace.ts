/** What a run observed of its editable inputs, and which of it an edit invalidates (pure, so it is tested without the engine). */

/** A read of [start, end) of the version `data`, or a lookup of whether the file existed. */
export type TraceEntry =
  | { kind: 'read'; path: string; data: Uint8Array; start: number; end: number; eof: boolean }
  | { kind: 'lookup'; path: string; existed: boolean };

/** The index of the first entry that `next` (the new content of `path`, absent = deleted) invalidates, or -1. `current` is the content the engine holds now. */
export function firstInvalidated(trace: readonly TraceEntry[], path: string, current: Uint8Array | undefined, next: Uint8Array | undefined): number {
  const diff = current && next ? firstDiff(current, next) : -1;
  return trace.findIndex((e) => e.path === path && (e.kind === 'lookup' ? e.existed !== !!next : readInvalidated(e, current, next, diff)));
}

function readInvalidated(e: Extract<TraceEntry, { kind: 'read' }>, current: Uint8Array | undefined, next: Uint8Array | undefined, diff: number): boolean {
  if (!next) return true;
  if (e.eof && next.length > e.end) return true;
  // Entries before the last resume read older versions of the file: compare the bytes they saw, not the buffer.
  if (e.data === current) return diff >= 0 && e.end > diff;
  return !sameRange(e.data, next, e.start, e.end);
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
