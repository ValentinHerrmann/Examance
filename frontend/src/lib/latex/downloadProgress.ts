import { writable } from 'svelte/store';

/** Where the local LaTeX engine is while it loads: counting downloaded bytes, then unpacking the TeX Live packages. */
export type LatexDownloadProgress =
  | { phase: 'download'; loaded: number; total: number }
  | { phase: 'prepare'; step: number; steps: number };

/** `null` while the engine is not loading (or ready). */
export const latexDownloadProgress = writable<LatexDownloadProgress | null>(null);
