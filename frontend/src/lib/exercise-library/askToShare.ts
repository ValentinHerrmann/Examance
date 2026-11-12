/** The share question after saving an exercise (issue #263): each own, unshared group is asked once; the account can remember the answer. Online only, like all sharing (`lib/api/exerciseSharing.ts`). */
import { get, writable } from 'svelte/store';
import { api } from '#lib/api/client';
import { markShareAsked, setExerciseSharing, setShareDefault } from '#lib/api/exerciseSharing';
import { mapApiToExerciseRecord } from '#lib/repositories/exerciseRepository';
import { capabilitiesStore, featureEnabled, markShareDefault } from '#lib/stores/capabilities';
import { isServerBacked } from '#lib/utils/serverBacked';

export interface ShareQuestion {
  exerciseId: string;
  groupId: string;
  name: string;
}

/** The open question; `exercise-library/ShareQuestionHost` (root layout) shows it, so it outlives the editor. */
export const shareQuestion = writable<ShareQuestion | null>(null);

/** Bumped whenever a group was shared from here, so an open library reloads its badges. */
export const sharedFromQuestion = writable(0);

/** Called after every successful editor save; decides from the server's view of the group, since exam pages hold rows without share state. */
export async function askToShare(exerciseId: string): Promise<void> {
  const caps = get(capabilitiesStore);
  if (!caps || caps.sharingPaused || !featureEnabled('exercise_sharing') || !isServerBacked()) return;
  try {
    const saved = mapApiToExerciseRecord(await api.get<any>(`/exercises/${exerciseId}`, { silentError: true }));
    const groupId = saved.exerciseGroupId;
    if (!groupId || saved.codeWithheld) return;
    const rows = (await api.get<any[]>(`/exercises?group_id=${encodeURIComponent(groupId)}`, { silentError: true })).map(mapApiToExerciseRecord);
    // Copies are never shared as one's own; a shared or already answered group is never asked again.
    if (!rows.length || rows.some((r) => r.isShared || r.groupCopied || r.groupShareAsked)) return;
    if (caps.shareNewExercises === true) {
      await setExerciseSharing(exerciseId, true);
      sharedFromQuestion.update((n) => n + 1);
    } else if (caps.shareNewExercises === false) {
      await markShareAsked(groupId);
    } else {
      shareQuestion.set({ exerciseId, groupId, name: saved.name ?? '' });
    }
  } catch (err) {
    // A courtesy question: a failed probe simply asks again after the next save.
    console.warn('Share question skipped:', err);
  }
}

/** Yes shares the group, No marks it as asked; `remember` stores the answer for the account (changeable in Settings). */
export async function answerShareQuestion(question: ShareQuestion, share: boolean, remember: boolean): Promise<void> {
  if (share) await setExerciseSharing(question.exerciseId, true);
  else await markShareAsked(question.groupId);
  if (share) sharedFromQuestion.update((n) => n + 1);
  if (remember) {
    await setShareDefault(share);
    markShareDefault(share);
  }
  shareQuestion.set(null);
}
