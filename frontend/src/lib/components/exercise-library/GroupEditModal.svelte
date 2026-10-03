<script lang="ts">
  import { type ExerciseGroup } from "$lib/exercise-library/groupExercises";
  import type { ExerciseRecord } from "$lib/db/schema";
  import SuggestInput from "$lib/components/common/SuggestInput.svelte";
  import { recordValue } from "$lib/utils/recentValues";
  import { t } from "$lib/i18n";
  import { Modal, Button, controlClass } from "$lib/components/ui";



  export let isOpen = false;
  export let editingGroup: ExerciseGroup | null = null;
  export let groupEditorName = "";
  export let groupEditorTopicTag = "";
  export let groupEditorGrade = "";
  export let groupEditorSubject = "";
  export let isGroupSaving = false;
  export let onSave: () => void;
  export let onClose: () => void;

  function handleSave() {
    if (groupEditorTopicTag) recordValue("exercise.topic", groupEditorTopicTag);
    if (groupEditorGrade) recordValue("exercise.grade", groupEditorGrade);
    if (groupEditorSubject) recordValue("exercise.subject", groupEditorSubject);
    onSave();
  }
</script>

<Modal open={isOpen && !!editingGroup} size="small" title={$t("exercises.groupEditModal.title")} onClose={onClose}>
  {#if editingGroup}
    <div class="-mx-4 mb-4 bg-highlight px-4 py-2 text-sm text-accent">
      {$t("exercises.groupEditModal.appliesToAll", { count: editingGroup.allMembers.length })}
    </div>

    <div class="mb-4 flex flex-col gap-1.5">
      <label for="groupEditorName" class="text-sm text-muted">{$t("exercises.groupEditModal.nameLabel")}</label>
      <input id="groupEditorName" type="text" bind:value={groupEditorName} required class={controlClass} />
    </div>

    <div class="mb-4 flex flex-col gap-1.5">
      <label for="groupEditorTopic" class="text-sm text-muted">{$t("exercises.groupEditModal.topicLabel")}</label>
      <SuggestInput
        id="groupEditorTopic"
        storageKey="exercise.topic"
        bind:value={groupEditorTopicTag}
        placeholder="_Vererbung"
        required
        class={controlClass}
      />
    </div>

    <div class="mb-4 flex flex-col gap-1.5">
      <label for="groupEditorGrade" class="text-sm text-muted">{$t("exercises.groupEditModal.gradeLabel")}</label>
      <SuggestInput
        id="groupEditorGrade"
        storageKey="exercise.grade"
        bind:value={groupEditorGrade}
        placeholder={$t("exercises.groupEditModal.gradePlaceholder")}
        class={controlClass}
      />
    </div>

    <div class="mb-4 flex flex-col gap-1.5">
      <label for="groupEditorSubject" class="text-sm text-muted">{$t("exercises.groupEditModal.subjectLabel")}</label>
      <SuggestInput
        id="groupEditorSubject"
        storageKey="exercise.subject"
        bind:value={groupEditorSubject}
        placeholder={$t("exercises.groupEditModal.subjectPlaceholder")}
        class={controlClass}
      />
    </div>
  {/if}

  <svelte:fragment slot="footer">
    <Button variant="outlined" severity="secondary" onClick={onClose}>{$t("common.cancel")}</Button>
    <Button onClick={handleSave} disabled={isGroupSaving}>
      {isGroupSaving ? $t("exercises.groupEditModal.saving") : $t("exercises.groupEditModal.saveButton")}
    </Button>
  </svelte:fragment>
</Modal>
