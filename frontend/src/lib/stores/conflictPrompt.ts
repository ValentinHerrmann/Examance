/**
 * The channel between an import and the conflict modal.
 *
 * `askAboutConflicts` is the default resolver for `openBgprojArchive`: it
 * publishes the conflicts, and the one `ImportConflictModal` mounted in the
 * root layout answers by settling the promise. The import genuinely waits, so
 * nothing is written until the teacher has decided.
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
