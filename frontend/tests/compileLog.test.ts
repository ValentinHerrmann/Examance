import { describe, it, expect } from 'vitest';
import { describeCompileFailure } from '../src/lib/latex/compileLog';

describe('describeCompileFailure', () => {
  const fatal = 'xdvipdfmx:fatal: Could not open specified DVI (or XDV) file: main.xdv';

  it('reports the XeTeX errors when the log only shows the follow-up xdvipdfmx fatal', () => {
    const message = describeCompileFailure({
      log: fatal,
      logs: [
        { cmd: 'xetex --no-pdf main.tex', log: '(./main.tex\n! Undefined control sequence.\nl.4 \\foo\n', exit_code: 1 },
        { cmd: 'xdvipdfmx -o main.pdf main.xdv', stderr: fatal, exit_code: 1 }
      ]
    });
    expect(message).toBe('! Undefined control sequence.\nl.4 \\foo');
  });

  it('falls back to the full log when no XeTeX error can be found', () => {
    expect(describeCompileFailure({ log: fatal })).toBe(fatal);
    expect(describeCompileFailure({ log: fatal, logs: [{ cmd: 'xetex', log: 'nothing', exit_code: 1 }] })).toBe(fatal);
  });

  it('leaves every other failure untouched', () => {
    expect(describeCompileFailure({ log: '! Missing $ inserted.' })).toBe('! Missing $ inserted.');
    expect(describeCompileFailure({ log: '' })).toBe('Compilation failed');
  });
});
