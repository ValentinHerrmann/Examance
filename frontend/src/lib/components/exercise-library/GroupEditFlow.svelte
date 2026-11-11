<script lang="ts">
  import { get } from "svelte/store";
  import { sessionStore } from "#lib/stores/session";
  import type { ExerciseGroup } from "#lib/exercise-library/groupExercises";
  import { saveGroupMetadata } from "#lib/exercise-library/saveGroupMetadata";
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
      await saveGroupMetadata(editingGroup, { name, topicTag, grade, subject }, get(sessionStore).sessionKey);
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
