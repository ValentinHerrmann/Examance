<script lang="ts">
  import { type ExerciseGroup } from "#lib/exercise-library/groupExercises";
  import type { ExerciseRecord } from "#lib/db/schema";
  import SuggestField from "#lib/components/common/SuggestField.svelte";
  import { recordValue } from "#lib/utils/recentValues";
  import { t } from "#lib/i18n";
  import { Modal, Button, Field, controlClass } from "#lib/components/ui";

  interface Props {
    isOpen?: boolean;
    /** Failure or validation message from the page, shown inline. */
    error?: string;
    editingGroup?: ExerciseGroup | null;
    groupEditorName?: string;
    groupEditorTopicTag?: string;
    groupEditorGrade?: string;
    groupEditorSubject?: string;
    isGroupSaving?: boolean;
    onSave: () => void;
    onClose: () => void;
  }

  let {
    isOpen = false,
    error = "",
    editingGroup = null,
    groupEditorName = $bindable(""),
    groupEditorTopicTag = $bindable(""),
    groupEditorGrade = $bindable(""),
    groupEditorSubject = $bindable(""),
    isGroupSaving = false,
    onSave,
    onClose
  }: Props = $props();

  function handleSave() {
    if (groupEditorTopicTag) recordValue("exercise.topic", groupEditorTopicTag);
    if (groupEditorGrade) recordValue("exercise.grade", groupEditorGrade);
    if (groupEditorSubject) recordValue("exercise.subject", groupEditorSubject);
    onSave();
  }
</script>

<Modal open={isOpen && !!editingGroup} size="small" title={$t("exercises.groupEditModal.title")} onClose={onClose} {error}>
  {#if editingGroup}
    <div class="-mx-4 mb-4 bg-highlight px-4 py-2 text-sm text-accent">
      {$t("exercises.groupEditModal.appliesToAll", { count: editingGroup.allMembers.length })}
    </div>

    <Field label={$t("exercises.groupEditModal.nameLabel")} forId="groupEditorName" class="mb-4">
      {#snippet children({ id })}
        <input {id} type="text" bind:value={groupEditorName} required class={controlClass} />
      {/snippet}
    </Field>
    <SuggestField
      id="groupEditorTopic"
      label={$t("exercises.groupEditModal.topicLabel")}
      storageKey="exercise.topic"
      bind:value={groupEditorTopicTag}
      placeholder="_Vererbung"
      required
      class="mb-4"
    />
    <SuggestField
      id="groupEditorGrade"
      label={$t("exercises.groupEditModal.gradeLabel")}
      storageKey="exercise.grade"
      bind:value={groupEditorGrade}
      placeholder={$t("exercises.groupEditModal.gradePlaceholder")}
      class="mb-4"
    />
    <SuggestField
      id="groupEditorSubject"
      label={$t("exercises.groupEditModal.subjectLabel")}
      storageKey="exercise.subject"
      bind:value={groupEditorSubject}
      placeholder={$t("exercises.groupEditModal.subjectPlaceholder")}
      class="mb-4"
    />
  {/if}

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" onClick={onClose}>{$t("common.cancel")}</Button>
    <Button onClick={handleSave} disabled={isGroupSaving}>
      {isGroupSaving ? $t("exercises.groupEditModal.saving") : $t("exercises.groupEditModal.saveButton")}
    </Button>
  {/snippet}
</Modal>
