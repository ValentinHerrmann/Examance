/** Choosing the OMR template a scanned page was printed with (issue #239): pure, so scan ingest and tests use it without the compile stack. */
import type { OmrPageTemplate, OmrTemplatePayload } from "#lib/db/schema";
import type { OmrRunInfo } from "./omrSettings";

export type OmrPinSource = "download" | "printed";

/** A template scans can be read with: a pin (with `pinnedAt`) or the current layout. */
export interface OmrTemplateCandidate {
  hash: string;
  pinnedAt?: string;
  source?: OmrPinSource;
  payload: OmrTemplatePayload;
}

/** Share of a page's boxes that must sit on their printed border before a template counts as the one the sheet was printed with. */
export const TEMPLATE_FIT_MIN = 0.8;

/** Candidates in the order to try: the preferred hash (the one that fit this booklet or submission before) first, then the rest in their order. */
export function tryOrder<T extends { hash: string }>(candidates: readonly T[], preferred?: string): T[] {
  const first = candidates.find((c) => c.hash === preferred);
  return first ? [first, ...candidates.filter((c) => c !== first)] : [...candidates];
}

/** Index of the reading to keep: the first that fits (`TEMPLATE_FIT_MIN`), else the best fit, else the first. A page without boxes (fit undefined) takes the first. */
export function pickByFit(fits: readonly (number | undefined)[]): number {
  const firstFit = fits.findIndex((f) => f !== undefined && f >= TEMPLATE_FIT_MIN);
  if (firstFit >= 0) return firstFit;
  let best = 0;
  fits.forEach((f, i) => {
    if (f !== undefined && f > (fits[best] ?? -1)) best = i;
  });
  return best;
}

/** Reads one scanned page with the candidates in `tryOrder`, stopping at the first that fits, and returns the reading `pickByFit` keeps; null when no candidate has this page or none answered. */
export async function readWithTemplates<R extends { pageStats: { templateFit?: number } }>(
  candidates: readonly OmrTemplateCandidate[],
  preferred: string | undefined,
  pageNo: number,
  read: (page: OmrPageTemplate) => Promise<R | null>,
): Promise<{ template: OmrTemplateCandidate; res: R; fits: boolean } | null> {
  const readings: { template: OmrTemplateCandidate; res: R }[] = [];
  for (const template of tryOrder(candidates, preferred)) {
    const page = template.payload.pages[pageNo - 1];
    if (!page || (page.bubbles.length === 0 && page.fiducials.length === 0)) continue;
    const res = await read(page); // NOSONAR: tried in order, stopping at the first that fits
    if (!res) continue;
    readings.push({ template, res });
    const fit = res.pageStats.templateFit;
    if (fit === undefined || fit >= TEMPLATE_FIT_MIN) break;
  }
  if (readings.length === 0) return null;
  const chosen = readings[pickByFit(readings.map((r) => r.res.pageStats.templateFit))];
  const fit = chosen.res.pageStats.templateFit;
  return { ...chosen, fits: fit !== undefined && fit >= TEMPLATE_FIT_MIN };
}

/** A run stamped with the template its row was read with. */
export function withTemplate(run: OmrRunInfo, template: Pick<OmrTemplateCandidate, "hash" | "pinnedAt"> | undefined): OmrRunInfo {
  if (!template) return run;
  const next: OmrRunInfo = { ...run, templateHash: template.hash };
  delete next.templatePinnedAt;
  if (template.pinnedAt) next.templatePinnedAt = template.pinnedAt;
  return next;
}
