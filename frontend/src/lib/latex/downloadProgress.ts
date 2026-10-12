import { writable } from 'svelte/store';

/** Bytes of the local LaTeX engine (TeX Live) downloaded so far; `null` while nothing is downloading. */
export interface LatexDownloadProgress {
  loaded: number;
  total: number;
}

export const latexDownloadProgress = writable<LatexDownloadProgress | null>(null);
