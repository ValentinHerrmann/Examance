/** The review print choice, remembered per browser: a convenience, so unreadable storage falls back to the default. */
import { safeLocalStorage } from '#lib/utils/storage';
import { DEFAULT_REVIEW_PRINT, type ReviewPrintOptions, type ReviewStrip } from './reviewPrint';

/** `export`: raw exports and the scan page; `share`: the PDF re-sealed for the student. */
export type ReviewPrintScope = 'export' | 'share';

const storageKey = (scope: ReviewPrintScope) => `bg_review_print_${scope}`;
const STRIPS: readonly ReviewStrip[] = ['none', 'side', 'bottom'];

const flag = (value: unknown, fallback: boolean) => (typeof value === 'boolean' ? value : fallback);

/** Fills what *raw* does not hold sensibly with the defaults. */
export function parseReviewPrint(raw: string | null): ReviewPrintOptions {
  if (!raw) return { ...DEFAULT_REVIEW_PRINT };
  try {
    const o = JSON.parse(raw) as Partial<Record<keyof ReviewPrintOptions, unknown>> | null;
    if (!o || typeof o !== 'object') return { ...DEFAULT_REVIEW_PRINT };
    const strip = STRIPS.find((s) => s === o.strip) ?? DEFAULT_REVIEW_PRINT.strip;
    return { short: flag(o.short, DEFAULT_REVIEW_PRINT.short), strip, summary: flag(o.summary, DEFAULT_REVIEW_PRINT.summary), attach: flag(o.attach, DEFAULT_REVIEW_PRINT.attach) };
  } catch {
    return { ...DEFAULT_REVIEW_PRINT };
  }
}

export const loadReviewPrint = (scope: ReviewPrintScope): ReviewPrintOptions => parseReviewPrint(safeLocalStorage.getItem(storageKey(scope)));

export function saveReviewPrint(scope: ReviewPrintScope, options: ReviewPrintOptions): void {
  safeLocalStorage.setItem(storageKey(scope), JSON.stringify(options));
}
