/**
 * Channel between an import and the conflict modal. `askAboutConflicts` (default resolver for
 * `openBgprojArchive`) publishes the conflicts; the `ImportConflictModal` in the root layout settles the
 * promise, so the import waits and nothing is written until the teacher decides.
 */

import { writable } from 'svelte/store';
import type { ArchiveConflict, DecisionMap } from '$lib/archive/conflicts';

export interface ConflictPrompt {
  conflicts: ArchiveConflict[];
  identicalCount: number;
  resolve: (decisions: DecisionMap) => void;
  reject: (reason: Error) => void;
}

export const conflictPrompt = writable<ConflictPrompt | null>(null);

export function askAboutConflicts(
  conflicts: ArchiveConflict[],
  identicalCount: number
): Promise<DecisionMap> {
  return new Promise((resolve, reject) => {
    conflictPrompt.set({ conflicts, identicalCount, resolve, reject });
  });
}
