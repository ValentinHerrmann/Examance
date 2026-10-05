/**
 * Channel between an archive import/export and the report modal: `showArchiveReport` publishes a
 * report, the `ArchiveReportModal` in the root layout shows it, and the promise settles when the
 * teacher closes it (so a caller can reload only afterwards).
 */

import { writable } from 'svelte/store';
import type { ArchiveReport } from '#lib/archive/report';

export interface ArchiveReportPrompt {
  report: ArchiveReport;
  close: () => void;
}

export const archiveReportPrompt = writable<ArchiveReportPrompt | null>(null);

export function showArchiveReport(report: ArchiveReport): Promise<void> {
  return new Promise((resolve) => {
    archiveReportPrompt.set({
      report,
      close: () => {
        archiveReportPrompt.set(null);
        resolve();
      },
    });
  });
}
