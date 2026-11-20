<script lang="ts">
  // Deleting one exercise from the library, after checking which exams use it. Opened through `open()`; a failed usage check blocks the delete (issue #298).
  import type { ExerciseRecord } from "#lib/db/schema";
  import { t, translate } from "#lib/i18n";
  import { loadExamUsage, type ExamUsageEntry } from "#lib/exercise-library/examUsage";
  import { exerciseRepository } from "#lib/repositories/exerciseRepository";
  import { TRASH_DAYS } from "#lib/trash/localTrash";
  import DeleteWithUsageModal from "#lib/components/common/DeleteWithUsageModal.svelte";

  interface Props {
    /** Reloads the library after the delete. */
    onSaved: () => Promise<void> | void;
  }

  let { onSaved }: Props = $props();

  let isOpen = $state(false);
  let exercise: ExerciseRecord | null = $state.raw(null);
  let exams: ExamUsageEntry[] = $state.raw([]);
  let usageLoading = $state(false);
  let usageFailed = $state(false);
  let busy = $state(false);
  let error = $state("");

  export async function open(ex: ExerciseRecord) {
    exercise = ex;
    exams = [];
    error = "";
    usageFailed = false;
    usageLoading = true;
    isOpen = true;
    try {
      exams = await loadExamUsage([ex.id!]);
    } catch (err) {
      // Unknown usage: deleting could break an exam, so the dialog blocks it (issue #298).
      usageFailed = true;
      error = translate("exercises.deleteModal.usageFailed");
      console.warn("Failed to check exercise usage:", err);
    } finally {
      usageLoading = false;
    }
  }

  async function confirm() {
    if (!exercise) return;
    busy = true;
    error = "";
    try {
      await exerciseRepository.delete(exercise.id!);
      isOpen = false;
      exercise = null;
      await onSaved();
    } catch (err: any) {
      error = translate("exercises.page.deleteFailed", { message: err.message });
    } finally {
      busy = false;
    }
  }
</script>

<DeleteWithUsageModal
  open={isOpen && !!exercise}
  title={exercise ? $t("exercises.deleteModal.title", { name: exercise.name || $t("exercises.untitled") }) : ""}
  {usageLoading}
  loadingText={$t("exercises.deleteModal.checkingUsage")}
  usageTitle={$t("exercises.deleteModal.warningTitle")}
  usageText={exams.length > 0 ? $t("exercises.deleteModal.usageInfo", { count: exams.length }) : ""}
  usageHint={$t("exercises.deleteModal.usageWarning")}
  items={exams.map((e) => ({ id: e.id, title: e.title, meta: e.datum }))}
  plainText={$t("exercises.deleteModal.confirmPlain")}
  restoreHint={$t("common.trashHint", { days: TRASH_DAYS })}
  confirmDisabled={usageFailed}
  {busy}
  {error}
  onConfirm={confirm}
  onClose={() => (isOpen = false)}
/>
