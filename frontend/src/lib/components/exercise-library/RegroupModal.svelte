<script lang="ts">
  import { type ExerciseGroup } from "#lib/exercise-library/groupExercises";
  import type { ExerciseRecord } from "#lib/db/schema";
  import { t } from "#lib/i18n";
  import { Alert, Modal, Button, Select } from "#lib/components/ui";

  interface Props {
    isOpen?: boolean;
    /** Failure or validation message from the page, shown inline. */
    error?: string;
    regroupingExercise?: ExerciseRecord | null;
    regroupTargetGroupId?: string;
    groups?: ExerciseGroup[];
    onSave: () => void;
    onClose: () => void;
  }

  let {
    isOpen = false,
    error = "",
    regroupingExercise = null,
    regroupTargetGroupId = $bindable(""),
    groups = [],
    onSave,
    onClose
  }: Props = $props();
</script>

<Modal open={isOpen && !!regroupingExercise} size="small" title={$t("exercises.regroupModal.title")} onClose={onClose}>
  {#if error}
    <div class="mb-3"><Alert severity="danger">{error}</Alert></div>
  {/if}
  {#if regroupingExercise}
    <p class="m-0 mb-5 text-content">
      {$t("exercises.regroupModal.moveMessage", { name: regroupingExercise.name })}
    </p>

    <div class="mb-4 flex flex-col gap-1.5">
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

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" onClick={onClose}>{$t("common.cancel")}</Button>
    <Button onClick={onSave}>{$t("exercises.regroupModal.moveButton")}</Button>
  {/snippet}
</Modal>
