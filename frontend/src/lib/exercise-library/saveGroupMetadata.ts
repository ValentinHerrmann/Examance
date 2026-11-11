/** The one save path of a group's metadata (single group dialog and bulk edit, issue #261): every member locally, then the group on the server. */
import type { ExerciseRecord } from '#lib/db/schema';
import type { ExerciseGroup } from '#lib/exercise-library/groupExercises';
import { loadExercisesEncrypted, saveExerciseEncrypted } from '#lib/db/dbEncryption';
import { api } from '#lib/api/client';
import { isServerBacked } from '#lib/utils/serverBacked';

export interface GroupMetadata {
  name: string;
  topicTag: string;
  grade: string;
  subject: string;
}

const DEFAULT_TOPIC = '_General';

/** API body of a metadata patch: only the given fields; "" clears grade or subject (the server treats null as "leave alone"), an empty topic falls back to the default. */
export function groupMetadataPayload(patch: Partial<GroupMetadata>): Record<string, string> {
  const body: Record<string, string> = {};
  if (patch.name !== undefined) body.name = patch.name.trim();
  if (patch.topicTag !== undefined) body.topic_tag = patch.topicTag.trim() || DEFAULT_TOPIC;
  if (patch.grade !== undefined) body.grade = patch.grade.trim();
  if (patch.subject !== undefined) body.subject = patch.subject.trim();
  return body;
}

function applied(ex: ExerciseRecord, patch: Partial<GroupMetadata>): ExerciseRecord {
  const next: ExerciseRecord = { ...ex, updatedAt: new Date().toISOString() };
  if (patch.name !== undefined) next.name = patch.name.trim();
  if (patch.topicTag !== undefined) next.topicTag = patch.topicTag.trim() || DEFAULT_TOPIC;
  if (patch.grade !== undefined) next.grade = patch.grade.trim() || undefined;
  if (patch.subject !== undefined) next.subject = patch.subject.trim() || undefined;
  return next;
}

/** Writes `patch` onto every member of `group`; `all` saves reloading the library once per group in a bulk edit. */
export async function saveGroupMetadata(
  group: ExerciseGroup,
  patch: Partial<GroupMetadata>,
  key: CryptoKey | null,
  all?: ExerciseRecord[],
): Promise<void> {
  const memberIds = new Set(group.allMembers.map((m) => m.ex.id));
  const library = all ?? (await loadExercisesEncrypted(key));
  const updated: ExerciseRecord[] = [];
  for (const ex of library) {
    if ((ex.exerciseGroupId && ex.exerciseGroupId === group.groupId) || memberIds.has(ex.id)) {
      const next = applied(ex, patch);
      await saveExerciseEncrypted(next, key); // NOSONAR: one record at a time, like every vault write
      updated.push(next);
    }
  }
  if (!isServerBacked()) return;
  const body = groupMetadataPayload(patch);
  if (group.groupId && !group.groupId.startsWith('name:')) {
    try {
      await api.patch(`/exercises/groups/${group.groupId}`, body);
      return;
    } catch (err) {
      console.warn('Failed to patch group on API, updating individual exercises:', err);
    }
  }
  for (const record of updated) await api.patch(`/exercises/${record.id}`, body); // NOSONAR: per-record fallback
}
