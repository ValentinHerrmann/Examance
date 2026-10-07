/**
 * Proposals from a linked copy back to the shared original (issue #65): submit, list, review, decide.
 * Online-only (never the offline queue); every call is `silentError`, the library page reports inline.
 */

import type { ExerciseRecord } from '#lib/db/schema';
import { mapApiToExerciseRecord } from '#lib/repositories/exerciseRepository';
import { api } from './client';

export type ContributionStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

export interface ContributionSummary {
  id: string;
  direction: 'incoming' | 'outgoing';
  exerciseName: string | null;
  kind: 'version' | 'variant';
  variantKey: string | null;
  message: string | null;
  status: ContributionStatus;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  /** Incoming: who proposed it. Outgoing: the author it was sent to. */
  counterpartEmail: string | null;
  /** The author's variant changed since the contributor's last update. */
  stale: boolean;
  /** The variant it changes no longer exists; it can only be accepted as a new variant. */
  targetGone: boolean;
}

export interface ContributionFile {
  filename: string;
  change: 'added' | 'removed' | 'changed' | 'unchanged';
  resourceId: string | null;
}

export interface ContributionDetail extends ContributionSummary {
  latexBody: string | null;
  maxPoints: number;
  /** Author only: the current row the proposal applies to (null for a new variant). */
  base: ExerciseRecord | null;
  files: ContributionFile[];
}

function toSummary(raw: any): ContributionSummary {
  return {
    id: raw.id,
    direction: raw.direction,
    exerciseName: raw.exercise_name ?? null,
    kind: raw.kind,
    variantKey: raw.variant_key ?? null,
    message: raw.message ?? null,
    status: raw.status,
    decisionNote: raw.decision_note ?? null,
    createdAt: raw.created_at,
    decidedAt: raw.decided_at ?? null,
    counterpartEmail: raw.counterpart_email ?? null,
    stale: !!raw.stale,
    targetGone: !!raw.target_gone,
  };
}

export async function listContributions(direction: 'incoming' | 'outgoing'): Promise<ContributionSummary[]> {
  const rows = await api.get<any[]>(`/exercises/contributions?direction=${direction}`, { silentError: true });
  return rows.map(toSummary);
}

export async function pendingIncomingCount(): Promise<number> {
  const res = await api.get<{ incoming_pending: number }>('/exercises/contributions/summary', { silentError: true });
  return res.incoming_pending;
}

export async function loadContribution(id: string): Promise<ContributionDetail> {
  const raw = await api.get<any>(`/exercises/contributions/${id}`, { silentError: true });
  return {
    ...toSummary(raw),
    latexBody: raw.latex_body ?? null,
    maxPoints: raw.max_points ?? 0,
    base: raw.base ? mapApiToExerciseRecord(raw.base) : null,
    files: (raw.files as any[]).map((f) => ({ filename: f.filename, change: f.change, resourceId: f.resource_id ?? null })),
  };
}

/** Proposes variants of an own linked copy (changed ones as versions, added ones as variants). */
export async function submitContributions(groupId: string, exerciseIds: string[], message: string): Promise<string[]> {
  return api.post<string[]>(
    `/exercises/groups/${groupId}/contributions`,
    { exercise_ids: exerciseIds, message: message.trim() || null },
    { silentError: true },
  );
}

/**
 * Adopts a proposal as a new version (or a new variant at version 1). `latexBody`: the author's edit.
 * @throws ApiError 409 `ERR_CONTRIBUTION_TARGET_GONE` (retry with `asVariant`) or `ERR_CONTRIBUTION_DECIDED`.
 */
export async function acceptContribution(
  id: string,
  opts: { latexBody?: string; asVariant?: boolean; variantKey?: string } = {},
): Promise<void> {
  await api.post(
    `/exercises/contributions/${id}/accept`,
    { latex_body: opts.latexBody ?? null, as_variant: !!opts.asVariant, variant_key: opts.variantKey || null },
    { silentError: true },
  );
}

export async function rejectContribution(id: string, note: string): Promise<void> {
  await api.post(`/exercises/contributions/${id}/reject`, { note: note.trim() || null }, { silentError: true });
}

export async function withdrawContribution(id: string): Promise<void> {
  await api.post(`/exercises/contributions/${id}/withdraw`, undefined, { silentError: true });
}
