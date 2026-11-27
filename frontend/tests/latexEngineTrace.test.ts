import { describe, expect, it } from 'vitest';
import { firstInvalidated, type TraceEntry } from '../src/lib/latex/engine/trace';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('firstInvalidated (issue #346)', () => {
  const v1 = bytes('line one\nline two\nline three\n');

  it('invalidates the first read that covers the change', () => {
    const trace: TraceEntry[] = [
      { kind: 'read', path: 'main.tex', data: v1, start: 0, end: 9, eof: false },
      { kind: 'read', path: 'main.tex', data: v1, start: 9, end: 18, eof: false },
      { kind: 'read', path: 'main.tex', data: v1, start: 18, end: 29, eof: false },
    ];
    expect(firstInvalidated(trace, 'main.tex', v1, bytes('line one\nline two\nline THREE\n'))).toBe(2);
    expect(firstInvalidated(trace, 'main.tex', v1, v1)).toBe(-1);
  });

  // Regression: after a resume the trace prefix still points at an older version's buffer; equal bytes must not count as a change.
  it('compares the bytes an entry read when it read an older version', () => {
    const v2 = bytes('line one\nline two\nline 3\n');
    const trace: TraceEntry[] = [
      { kind: 'read', path: 'main.tex', data: v1, start: 0, end: 9, eof: false },
      { kind: 'read', path: 'main.tex', data: v2, start: 9, end: 18, eof: false },
      { kind: 'read', path: 'main.tex', data: v2, start: 18, end: 25, eof: false },
    ];
    expect(firstInvalidated(trace, 'main.tex', v2, bytes('line one\nline two\nline 4\n'))).toBe(2);
    expect(firstInvalidated(trace, 'main.tex', v2, bytes('LINE one\nline two\nline 3\n'))).toBe(0);
  });

  it('treats a longer file as a change to a read that hit the end', () => {
    const trace: TraceEntry[] = [{ kind: 'read', path: 'main.aux', data: v1, start: 0, end: v1.length, eof: true }];
    expect(firstInvalidated(trace, 'main.aux', v1, bytes('line one\nline two\nline three\nmore\n'))).toBe(0);
  });

  it('invalidates lookups when a file appears or disappears', () => {
    const trace: TraceEntry[] = [
      { kind: 'lookup', path: 'main.aux', existed: false },
      { kind: 'lookup', path: 'figure.png', existed: true },
    ];
    expect(firstInvalidated(trace, 'main.aux', undefined, v1)).toBe(0);
    expect(firstInvalidated(trace, 'figure.png', v1, undefined)).toBe(1);
    expect(firstInvalidated(trace, 'figure.png', v1, bytes('new'))).toBe(-1);
  });
});
