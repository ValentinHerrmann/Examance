<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import { t } from "$lib/i18n";
  import { Modal, Button, Select } from "$lib/components/ui";

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
  export let regroupingExercise: ExerciseRecord | null = null;
  export let regroupTargetGroupId = "";
  export let groups: ExerciseGroup[] = [];
  export let onSave: () => void;
  export let onClose: () => void;
</script>

<Modal open={isOpen && !!regroupingExercise} size="sm" title={$t("exercises.regroupModal.title")} onClose={onClose}>
  {#if regroupingExercise}
    <p class="m-0 mb-5 text-content">
      {$t("exercises.regroupModal.moveMessage", { name: regroupingExercise.name })}
    </p>

    <div class="mb-4 flex flex-col gap-[0.375rem]">
      <label for="targetGroup" class="text-sm text-muted">{$t("exercises.regroupModal.targetLabel")}</label>
      <Select id="targetGroup" bind:value={regroupTargetGroupId}>
        <option value="NEW">{$t("exercises.regroupModal.createNewGroup")}</option>
        {#each groups as group}
          {#if group.groupId !== regroupingExercise.exerciseGroupId}
            <option value={group.groupId}>{group.name}</option>
          {/if}
        {/each}
      </Select>
    </div>
  {/if}

  <svelte:fragment slot="footer">
    <Button variant="secondary" onClick={onClose}>{$t("common.cancel")}</Button>
    <Button variant="primary" onClick={onSave}>{$t("exercises.regroupModal.moveButton")}</Button>
  </svelte:fragment>
</Modal>
