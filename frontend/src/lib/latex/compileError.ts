import { translate } from '#lib/i18n';
import { annotateLog, mapLine, type SourceLocation, type SourceMap, type SourceRange } from './sourceMap';
import { extractTexErrors } from './texLog';

/** A failed compile with the engine's full log (issue #166); `message` is the short summary shown inline. */
export class LatexCompileError extends Error {
  constructor(
    message: string,
    public log: string,
    public engine: 'local' | 'server',
    /** The unmarked document that failed (never marked LaTeX) and its exercise ranges; feed the AI prompt (issue #168). */
    public source?: string,
    public ranges: SourceRange[] = []
  ) {
    super(message);
    this.name = 'LatexCompileError';
  }

  /** Attached files of the compile, for the AI prompt: inline names, plus exercises whose files the server loaded. */
  files: CompileFiles = { names: [], exerciseIds: [] };
}

/** "Exercise “X”, line n" or "generated document, line n". */
export function describeLocation(loc: SourceLocation): string {
  return loc.label
    ? translate('misc.compiler.locationExercise', { label: loc.label, line: String(loc.line) })
    : translate('misc.compiler.locationGenerated', { line: String(loc.line) });
}

/**
 * The error with its TeX errors summarized and their line numbers mapped back to the exercises
 * (`map` from `extractSourceMap`). Keeps the original message when the log holds no "!" error.
 */
export function withSourceLocations(err: LatexCompileError, map: SourceMap): LatexCompileError {
  const blocks = extractTexErrors(err.log);
  if (blocks.length === 0) return new LatexCompileError(err.message, err.log, err.engine, map.tex, map.ranges);
  const summary = blocks
    .map((block) => {
      // Lines are trimmed, so an empty context line is a bare `l.<n>`.
      const ctx = /^l\.(\d+)(?: (.*))?$/m.exec(block);
      const loc = ctx && map.ranges.length > 0 ? mapLine(map, Number(ctx[1]), ctx[2] ?? '') : null;
      return loc ? `${describeLocation(loc)}:\n${block}` : block;
    })
    .join('\n\n');
  return new LatexCompileError(summary, annotateLog(err.log, map, describeLocation), err.engine, map.tex, map.ranges);
}

export type CompileFiles = { names: string[]; exerciseIds: string[] };

/** What the error help needs from a failed compile: log, the unmarked source with its exercise ranges, the engine. */
export type CompileFailure = { log: string; source: string | null; ranges: SourceRange[]; engine: 'local' | 'server'; files: CompileFiles };

export function compileFailure(err: unknown): CompileFailure | null {
  return err instanceof LatexCompileError && err.log
    ? { log: err.log, source: err.source ?? null, ranges: err.ranges, engine: err.engine, files: err.files }
    : null;
}
