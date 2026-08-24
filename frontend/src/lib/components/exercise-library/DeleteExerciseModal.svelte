<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import { t } from "$lib/i18n";
  import { Modal, Button } from "$lib/components/ui";

  export let isOpen = false;
  export let deletingExercise: ExerciseRecord | null = null;
  export let isDeleteLoading = false;
  export let deleteUsageInfo: { examCount: number; exams: { id: string; title: string; datum: string | null }[] } | null = null;
  export let onConfirm: () => void;
  export let onClose: () => void;
</script>

<Modal
  open={isOpen && !!deletingExercise}
  size="sm"
  title={deletingExercise ? $t("exercises.deleteModal.title", { name: deletingExercise.name || $t("exercises.untitled") }) : ""}
  onClose={onClose}
>
  {#if isDeleteLoading}
    <p>{$t("exercises.deleteModal.checkingUsage")}</p>
  {:else if deleteUsageInfo && deleteUsageInfo.examCount > 0}
    <div class="rounded-lg border border-red-500 bg-red-500/15 p-4 text-red-300">
      <h4 class="m-0 mb-2 text-red-400">{$t("exercises.deleteModal.warningTitle")}</h4>
      <p>
        {$t("exercises.deleteModal.usageInfo", { count: deleteUsageInfo.examCount })}
      </p>
      <ul class="my-2 pl-6 text-content/90">
        {#each deleteUsageInfo.exams as exam}
          <li>
            <strong>{exam.title}</strong>
            {#if exam.datum}<span class="ml-[0.35rem] text-[0.85rem] text-muted">({exam.datum})</span>{/if}
          </li>
        {/each}
      </ul>
      <p class="mt-3 text-[0.85rem] text-muted">
        {$t("exercises.deleteModal.usageWarning")}
      </p>
    </div>
  {:else}
    <p>{$t("exercises.deleteModal.confirmPlain")}</p>
  {/if}

  <svelte:fragment slot="footer">
    <Button variant="secondary" onClick={onClose}>{$t("common.cancel")}</Button>
    <Button variant="danger" onClick={onConfirm} disabled={isDeleteLoading}>
      {$t("exercises.deleteModal.deleteAnyway")}
    </Button>
  </svelte:fragment>
</Modal>
