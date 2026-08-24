<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import SuggestInput from "$lib/components/common/SuggestInput.svelte";
  import { recordValue } from "$lib/utils/recentValues";
  import { t } from "$lib/i18n";
  import { Modal, Button, controlClass } from "$lib/components/ui";

  interface VariantMember {
    ex: ExerciseRecord;
    variantLabel: string;
    version: number;
    isCurrent: boolean;
  }

  interface ExerciseGroup {
    groupId: string;
    name: string;
    topicTag: string;
    grade?: string;
    subject?: string;
    maxPoints: number;
    minPoints: number;
    variants: Map<string, VariantMember[]>;
    allMembers: VariantMember[];
  }

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

<Modal open={isOpen && !!editingGroup} size="sm" title={$t("exercises.groupEditModal.title")} onClose={onClose}>
  {#if editingGroup}
    <div class="-mx-4 -mt-4 mb-4 bg-sky-600/20 px-6 py-2 text-[0.85rem] text-sky-300 sm:-mx-5 sm:-mt-5">
      {$t("exercises.groupEditModal.appliesToAll", { count: editingGroup.allMembers.length })}
    </div>

    <div class="mb-4 flex flex-col gap-[0.375rem]">
      <label for="groupEditorName" class="text-sm text-muted">{$t("exercises.groupEditModal.nameLabel")}</label>
      <input id="groupEditorName" type="text" bind:value={groupEditorName} required class={controlClass} />
    </div>

    <div class="mb-4 flex flex-col gap-[0.375rem]">
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

    <div class="mb-4 flex flex-col gap-[0.375rem]">
      <label for="groupEditorGrade" class="text-sm text-muted">{$t("exercises.groupEditModal.gradeLabel")}</label>
      <SuggestInput
        id="groupEditorGrade"
        storageKey="exercise.grade"
        bind:value={groupEditorGrade}
        placeholder={$t("exercises.groupEditModal.gradePlaceholder")}
        class={controlClass}
      />
    </div>

    <div class="mb-4 flex flex-col gap-[0.375rem]">
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
    <Button variant="secondary" onClick={onClose}>{$t("common.cancel")}</Button>
    <Button variant="primary" onClick={handleSave} disabled={isGroupSaving}>
      {isGroupSaving ? $t("exercises.groupEditModal.saving") : $t("exercises.groupEditModal.saveButton")}
    </Button>
  </svelte:fragment>
</Modal>
