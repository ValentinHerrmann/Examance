/** What a browser compile's logs say: missing figures, and the XeTeX error behind a follow-up xdvipdfmx fatal. Pure, so tests import it without a worker. */
import { extractTexErrors } from './texLog';

// A missing figure is not fatal to XeLaTeX: it typesets a box and carries on, so the compile "succeeds" with the picture silently absent. Surfacing it is the difference between a teacher noticing now and noticing on exam day.
export const MISSING_GRAPHICS_PATTERN =
  /(File `[^']+\.(png|jpe?g|pdf|eps)' not found|Unable to load picture|Cannot determine size of graphic)/i;

export function extractMissingGraphics(log: string | undefined | null): string[] {
  if (!log) return [];
  return log
    .split("\n")
    .filter((line) => MISSING_GRAPHICS_PATTERN.test(line))
    .map((line) => line.trim());
}

// xdvipdfmx runs after XeTeX even when XeTeX wrote no XDV, so the log then ends in this fatal while the real error sits in the XeTeX step's log.
export const XDV_OPEN_FATAL_PATTERN = /xdvipdfmx:fatal: Could not open specified DVI \(or XDV\) file/i;

/** One program run of a compile: its command line, log file, terminal output and exit code. */
export interface CompileStep {
  cmd?: string;
  log?: string;
  stdout?: string;
  stderr?: string;
  exit_code?: number;
}

/** The message for a failed compile: the XeTeX step's errors when the log only shows the follow-up xdvipdfmx fatal. */
export function describeCompileFailure(result: {
  log?: string | null;
  logs?: readonly CompileStep[] | null;
}): string {
  const full = result.log || 'Compilation failed';
  if (!XDV_OPEN_FATAL_PATTERN.test(full)) return full;

  const steps = (result.logs ?? []).filter((step) => !/xdvipdfmx/i.test(step.cmd ?? ''));
  const failed =
    steps.find((step) => (step.exit_code ?? 0) !== 0) ?? steps.find((step) => /xetex/i.test(step.cmd ?? ''));
  for (const text of [failed?.log, failed?.stdout, failed?.stderr]) {
    const blocks = extractTexErrors(text);
    if (blocks.length > 0) return blocks.join('\n\n');
  }
  return full;
}

/** The full log for the UI; with the follow-up xdvipdfmx fatal it is preceded by the XeTeX step's own log. */
export function compileLogForUser(result: { log?: string | null; logs?: readonly CompileStep[] | null }): string {
  const full = result.log || '';
  if (!XDV_OPEN_FATAL_PATTERN.test(full)) return full;
  const xetex = (result.logs ?? []).find((step) => /xetex/i.test(step.cmd ?? '') && !/xdvipdfmx/i.test(step.cmd ?? ''));
  const own = [xetex?.log, xetex?.stdout, xetex?.stderr].filter(Boolean).join('\n');
  return own ? `${own}\n\n${full}` : full;
}
