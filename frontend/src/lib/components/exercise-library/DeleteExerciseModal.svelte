<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import { t } from "$lib/i18n";
  import { Alert, ConfirmDeleteModal } from "$lib/components/ui";

  export let isOpen = false;
  export let deletingExercise: ExerciseRecord | null = null;
  export let isDeleteLoading = false;
  export let deleteUsageInfo: { examCount: number; exams: { id: string; title: string; datum: string | null }[] } | null = null;
  export let onConfirm: () => void;
  export let onClose: () => void;
</script>

<ConfirmDeleteModal
  open={isOpen && !!deletingExercise}
  title={deletingExercise ? $t("exercises.deleteModal.title", { name: deletingExercise.name || $t("exercises.untitled") }) : ""}
  {isDeleteLoading}
  confirmLabel={$t("exercises.deleteModal.deleteAnyway")}
  cancelLabel={$t("common.cancel")}
  {onConfirm}
  {onClose}
>
  {#if isDeleteLoading}
    <p>{$t("exercises.deleteModal.checkingUsage")}</p>
  {:else if deleteUsageInfo && deleteUsageInfo.examCount > 0}
    <Alert severity="danger" title={$t("exercises.deleteModal.warningTitle")}>
      <p class="m-0">
        {$t("exercises.deleteModal.usageInfo", { count: deleteUsageInfo.examCount })}
      </p>
      <ul class="my-2 pl-6">
        {#each deleteUsageInfo.exams as exam}
          <li>
            <strong>{exam.title}</strong>
            {#if exam.datum}<span class="ml-1.5 text-sm text-muted">({exam.datum})</span>{/if}
          </li>
        {/each}
      </ul>
      <p class="m-0 text-sm text-muted">
        {$t("exercises.deleteModal.usageWarning")}
      </p>
    </Alert>
  {:else}
    <p>{$t("exercises.deleteModal.confirmPlain")}</p>
  {/if}
</ConfirmDeleteModal>
