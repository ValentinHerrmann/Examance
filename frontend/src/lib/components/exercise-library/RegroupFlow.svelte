<script lang="ts">
  import { get } from "svelte/store";
  import { sessionStore } from "#lib/stores/session";
  import type { ExerciseRecord } from "#lib/db/schema";
  import type { ExerciseGroup } from "#lib/exercise-library/groupExercises";
  import { saveExerciseEncrypted } from "#lib/db/dbEncryption";
  import { api } from "#lib/api/client";
  import { translate } from "#lib/i18n";
  import RegroupModal from "./RegroupModal.svelte";

  interface Props {
    /** All own groups: the move targets, and where the target's metadata is taken from. */
    groups: ExerciseGroup[];
    /** Reloads the library after the move. */
    onSaved: () => Promise<void> | void;
  }

  let { groups, onSaved }: Props = $props();

  let isOpen = $state(false);
  let error = $state("");
  let regroupingExercise: ExerciseRecord | null = $state.raw(null);
  let targetGroupId: string = $state("");

  /** Opens the dialog to move `ex` into another group, or into a new one. */
  export function open(ex: ExerciseRecord) {
    error = "";
    regroupingExercise = ex;
    targetGroupId = "NEW";
    isOpen = true;
  }

  async function save() {
    error = "";
    if (!regroupingExercise) return;

    let groupId = targetGroupId;
    let targetName = regroupingExercise.name;
    let targetTopic = regroupingExercise.topicTag;
    let targetGrade = regroupingExercise.grade;
    let targetSubject = regroupingExercise.subject;

    if (groupId === "NEW") {
      groupId = crypto.randomUUID();
    } else {
      const targetGroup = groups.find(g => g.groupId === groupId);
      if (targetGroup) {
        targetName = targetGroup.name;
        targetTopic = targetGroup.topicTag;
        targetGrade = targetGroup.grade;
        targetSubject = targetGroup.subject;

        const collision = targetGroup.allMembers.find(m => m.ex.variantKey === regroupingExercise!.variantKey);
        if (collision) {
          regroupingExercise.variantKey = `${regroupingExercise.variantKey} (2)`;
        }
      }
    }

    const updatedEx = {
      ...regroupingExercise,
      exerciseGroupId: groupId,
      name: targetName,
      topicTag: targetTopic,
      grade: targetGrade,
      subject: targetSubject,
    };

    try {
      const key = get(sessionStore).sessionKey;
      await saveExerciseEncrypted(updatedEx, key);

      await api.patch(`/exercises/${updatedEx.id}`, {
        exercise_group_id: updatedEx.exerciseGroupId,
        name: updatedEx.name,
        topic_tag: updatedEx.topicTag,
        grade: updatedEx.grade || null,
        subject: updatedEx.subject || null,
        variant_key: updatedEx.variantKey || null
      });

      isOpen = false;
      regroupingExercise = null;
      await onSaved();
    } catch (err: any) {
      error = translate("exercises.page.regroupFailed", { message: err.message });
    }
  }
</script>

<RegroupModal
  {isOpen}
  {error}
  {regroupingExercise}
  bind:regroupTargetGroupId={targetGroupId}
  {groups}
  onSave={save}
  onClose={() => (isOpen = false)}
/>
