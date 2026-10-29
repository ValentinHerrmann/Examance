<script lang="ts">
  import { get } from "svelte/store";
  import { sessionStore } from "#lib/stores/session";
  import type { ExerciseRecord } from "#lib/db/schema";
  import type { ExerciseGroup } from "#lib/exercise-library/groupExercises";
  import { loadExercisesEncrypted, saveExerciseEncrypted } from "#lib/db/dbEncryption";
  import { api } from "#lib/api/client";
  import { isServerBacked } from "#lib/utils/serverBacked";
  import { translate } from "#lib/i18n";
  import GroupEditModal from "./GroupEditModal.svelte";

  interface Props {
    /** Reloads the library after the metadata was saved. */
    onSaved: () => Promise<void> | void;
  }

  let { onSaved }: Props = $props();

  let isOpen = $state(false);
  let error = $state("");
  let editingGroup: ExerciseGroup | null = $state.raw(null);
  let name = $state("");
  let topicTag = $state("_General");
  let grade = $state("");
  let subject = $state("");
  let isSaving = $state(false);

  /** Opens the metadata dialog for `group` (name, topic, grade, subject apply to every member). */
  export function open(group: ExerciseGroup) {
    error = "";
    editingGroup = group;
    name = group.name;
    topicTag = group.topicTag;
    grade = group.grade || "";
    subject = group.subject || "";
    isOpen = true;
  }

  async function save() {
    error = "";
    if (!editingGroup) return;
    if (!name.trim()) {
      error = translate("exercises.page.groupNameRequired");
      return;
    }

    isSaving = true;
    try {
      const key = get(sessionStore).sessionKey;
      const updatedName = name.trim();
      const updatedTopicTag = topicTag.trim() || "_General";
      const updatedGrade = grade.trim() || undefined;
      const updatedSubject = subject.trim() || undefined;

      const memberIds = new Set(editingGroup.allMembers.map((m) => m.ex.id));
      const allLocal = await loadExercisesEncrypted(key);
      const updatedRecords: ExerciseRecord[] = [];

      for (const ex of allLocal) {
        if (
          (ex.exerciseGroupId && ex.exerciseGroupId === editingGroup.groupId) ||
          memberIds.has(ex.id)
        ) {
          const updatedEx: ExerciseRecord = {
            ...ex,
            name: updatedName,
            topicTag: updatedTopicTag,
            grade: updatedGrade,
            subject: updatedSubject,
            updatedAt: new Date().toISOString(),
          };
          await saveExerciseEncrypted(updatedEx, key);
          updatedRecords.push(updatedEx);
        }
      }

      if (isServerBacked()) {
        if (editingGroup.groupId && !editingGroup.groupId.startsWith("name:")) {
          try {
            await api.patch(`/exercises/groups/${editingGroup.groupId}`, {
              name: updatedName,
              topic_tag: updatedTopicTag,
              grade: updatedGrade || null,
              subject: updatedSubject || null,
            });
          } catch (apiErr) {
            console.warn("Failed to patch group on API, updating individual exercises:", apiErr);
            for (const record of updatedRecords) {
              await api.patch(`/exercises/${record.id}`, {
                name: record.name,
                topic_tag: record.topicTag,
                grade: record.grade || null,
                subject: record.subject || null,
              });
            }
          }
        } else {
          for (const record of updatedRecords) {
            await api.patch(`/exercises/${record.id}`, {
              name: record.name,
              topic_tag: record.topicTag,
              grade: record.grade || null,
              subject: record.subject || null,
            });
          }
        }
      }

      isOpen = false;
      editingGroup = null;
      await onSaved();
    } catch (err: any) {
      error = translate("exercises.page.groupSaveFailed", { message: err.message });
    } finally {
      isSaving = false;
    }
  }
</script>

<GroupEditModal
  {isOpen}
  {error}
  {editingGroup}
  bind:groupEditorName={name}
  bind:groupEditorTopicTag={topicTag}
  bind:groupEditorGrade={grade}
  bind:groupEditorSubject={subject}
  isGroupSaving={isSaving}
  onSave={save}
  onClose={() => (isOpen = false)}
/>
