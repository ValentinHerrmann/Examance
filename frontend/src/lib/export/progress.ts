import type { ZipBuilder } from './zip';

/** Progress callback shared by every raw export and `ExportOptionsModal`. */
export type ExportProgress = (step: string, done?: number, total?: number) => void;

/** What an export run hands back to the dialog, which downloads it and lists the non-fatal warnings. */
export interface ExportResult {
  zip: ZipBuilder;
  fileName: string;
  warnings: string[];
}

// POST /compile/latex/jobs allows 10 requests per minute; batches stay just under it.
const SERVER_COMPILES_PER_MINUTE = 9;
const starts: number[] = [];

/** Waits until another server compile fits the rate limit. Local (WASM) compiles never wait. */
export async function paceServerCompile(useLocal: boolean): Promise<void> {
  if (useLocal) return;
  const now = Date.now();
  while (starts.length && now - starts[0] >= 60_000) starts.shift();
  if (starts.length < SERVER_COMPILES_PER_MINUTE) {
    starts.push(now);
    return;
  }
  await new Promise((r) => setTimeout(r, 60_000 - (now - starts[0]) + 50));
  return paceServerCompile(useLocal);
}
