/**
 * Exercise sharing (issue #65): share own exercise groups with every account, browse and copy shared ones,
 * resync copies. Online-only on purpose (never the offline queue): a share, copy or resync must not be
 * replayed into another workspace. Every call is `silentError`; the library page reports inline.
 */

import type { ExerciseRecord } from '#lib/db/schema';
import { mapApiToExerciseRecord } from '#lib/repositories/exerciseRepository';
import { api } from './client';

/** Another account's shared row, mapped like an own one, plus who shared it. */
export interface SharedExercise {
  exercise: ExerciseRecord;
  sharedByEmail: string;
  sharedAt?: string;
}

export type SyncState = 'up_to_date' | 'update_available' | 'source_unavailable';

export interface SyncStatus {
  groupId: string;
  state: SyncState;
  locallyModified: boolean;
  /** Variants added to the copy; they can be proposed to the original. */
  localVariants: number;
}

export interface ResyncVariant {
  kind: 'changed' | 'new' | 'unchanged' | 'removed' | 'local';
  locallyModified: boolean;
  sourceExerciseId: string | null;
  sourceFingerprint: string | null;
  source: ExerciseRecord | null;
  own: ExerciseRecord | null;
}

export interface ResyncPreview {
  groupId: string;
  variants: ResyncVariant[];
}

function toShared(raw: any): SharedExercise {
  return { exercise: mapApiToExerciseRecord(raw), sharedByEmail: raw.shared_by_email, sharedAt: raw.shared_at ?? undefined };
}

/** Everything other accounts currently share (filtered and paged on the client). */
export async function listSharedExercises(): Promise<SharedExercise[]> {
  const out: SharedExercise[] = [];
  const pageSize = 200;
  // Paged so a large installation never answers with one unbounded response.
  for (let offset = 0; ; offset += pageSize) {
    const page = await api.get<any[]>(`/exercises/shared?limit=${pageSize}&offset=${offset}`, { silentError: true });
    out.push(...page.map(toShared));
    if (page.length < pageSize) return out;
  }
}

/** Shares (or stops sharing) the whole group of an own exercise. @returns the group's current rows. */
export async function setExerciseSharing(exerciseId: string, shared: boolean): Promise<ExerciseRecord[]> {
  const rows = await api.put<any[]>(`/exercises/${exerciseId}/sharing`, { shared }, { silentError: true });
  return rows.map(mapApiToExerciseRecord);
}

/** Copies a shared group into the own library (a new private group linked to its source). */
export async function copySharedExercise(exerciseId: string): Promise<{ groupId: string; exercises: ExerciseRecord[] }> {
  const res = await api.post<{ group_id: string; exercises: any[] }>(`/exercises/${exerciseId}/copy`, undefined, {
    silentError: true,
  });
  return { groupId: res.group_id, exercises: res.exercises.map(mapApiToExerciseRecord) };
}

export async function loadSyncStatus(): Promise<SyncStatus[]> {
  const rows = await api.get<any[]>('/exercises/sync-status', { silentError: true });
  return rows.map((r) => ({
    groupId: r.group_id,
    state: r.state,
    locallyModified: r.locally_modified,
    localVariants: r.local_variants ?? 0,
  }));
}

export async function loadResyncPreview(groupId: string): Promise<ResyncPreview> {
  const res = await api.get<any>(`/exercises/groups/${groupId}/resync-preview`, { silentError: true });
  return {
    groupId: res.group_id,
    variants: (res.variants as any[]).map((v) => ({
      kind: v.kind,
      locallyModified: v.locally_modified,
      sourceExerciseId: v.source_exercise_id ?? null,
      sourceFingerprint: v.source_fingerprint ?? null,
      source: v.source ? mapApiToExerciseRecord(v.source) : null,
      own: v.own ? mapApiToExerciseRecord(v.own) : null,
    })),
  };
}

/**
 * Takes over the chosen variants of a reviewed preview (others stay pending): changed ones become new
 * versions, new source variants new rows. `overrides` maps a source row id to hand-merged LaTeX.
 * @throws ApiError 409 `ERR_SHARE_SOURCE_CHANGED` when a chosen source changed after the preview.
 */
export async function applyResync(
  preview: ResyncPreview,
  selected: Set<string>,
  overrides: Record<string, string> = {},
): Promise<ExerciseRecord[]> {
  const reviewed: Record<string, string> = {};
  const edits: Record<string, { latex_body: string }> = {};
  for (const v of preview.variants) {
    const id = v.sourceExerciseId;
    if ((v.kind === 'changed' || v.kind === 'new') && id && v.sourceFingerprint && selected.has(id)) {
      reviewed[id] = v.sourceFingerprint;
      if (id in overrides) edits[id] = { latex_body: overrides[id] };
    }
  }
  const rows = await api.post<any[]>(
    `/exercises/groups/${preview.groupId}/resync`,
    { source_fingerprints: reviewed, overrides: edits },
    { silentError: true },
  );
  return rows.map(mapApiToExerciseRecord);
}

/** Shares (or stops sharing) every own exercise group; copies of others' groups are skipped. */
export async function bulkSetSharing(shared: boolean): Promise<{ groups: number; skippedCopies: number }> {
  const res = await api.post<{ groups: number; skipped_copies: number }>(
    '/exercises/sharing/bulk',
    { shared },
    { silentError: true },
  );
  return { groups: res.groups, skippedCopies: res.skipped_copies };
}

/** Pauses (hides everything shared, keeping each choice) or resumes this account's sharing. */
export async function setSharingPaused(paused: boolean): Promise<void> {
  await api.put('/exercises/sharing/pause', { paused }, { silentError: true });
}

/** Detaches a copied group from its source; the content stays. */
export async function unlinkSource(groupId: string): Promise<void> {
  await api.delete(`/exercises/groups/${groupId}/source`, { silentError: true });
}
