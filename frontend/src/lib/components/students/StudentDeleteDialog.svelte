<script lang="ts">
  /** Deleting students says what goes with them (issue #209): a student with a scanned exam takes the scan, every grading and the share links along, so that needs an explicit tick. Everything goes to the trash as one entry. */
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { t } from "#lib/i18n";
  import { Checkbox, ConfirmDialog } from "#lib/components/ui";
  import type { StudentRecord, SubmissionRecord } from "#lib/db/schema";
  import { scoreRepository } from "#lib/repositories/scoreRepository";
  import { studentRepository } from "#lib/repositories/studentRepository";
  import { submissionRepository } from "#lib/repositories/submissionRepository";
  import { sessionStore } from "#lib/stores/session";
  import { TRASH_DAYS } from "#lib/trash/localTrash";
  import { newTrashGroup } from "#lib/trash/group";
  import { formatStudentName } from "#lib/utils/studentQr";

  interface Props {
    examId: string;
    students: readonly StudentRecord[];
    submissionOf: (student: StudentRecord) => SubmissionRecord | undefined;
    /** Offered when exactly one student is deleted and a likely duplicate exists. */
    onMergeInstead?: () => void;
    onDone: () => void;
    onCancel: () => void;
  }

  let { examId, students, submissionOf, onMergeInstead, onDone, onCancel }: Props = $props();

  let gradedCount = $state<number | null>(null);
  let understood = $state(false);
  let busy = $state(false);
  let error = $state("");

  let scanned = $derived(students.filter((st) => submissionOf(st)));
  let names = $derived(students.map((st) => formatStudentName(st.studentName) || st.fallbackCode || "?").join(", "));

  onMount(async () => {
    const key = get(sessionStore).sessionKey;
    try {
      // Graded = at least one score row or annotations; read only for the scanned ones.
      const graded = await Promise.all(
        scanned.map(async (st) => {
          const sub = submissionOf(st)!;
          if (sub.annotationCt) return true;
          return (await scoreRepository.getBySubmissionId(examId, sub.id, key)).some((s) => s.score !== undefined && s.score !== null);
        })
      );
      gradedCount = graded.filter(Boolean).length;
    } catch {
      gradedCount = null;
    }
  });

  async function remove() {
    busy = true;
    error = "";
    try {
      const group = newTrashGroup();
      for (const st of students) {
        const sub = submissionOf(st);
        if (sub) await submissionRepository.delete(examId, sub.id, { group }); // NOSONAR: one trash group, written in order
        await studentRepository.delete(st, { group }); // NOSONAR: as above
      }
      onDone();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      busy = false;
    }
  }
</script>

<ConfirmDialog
  open={true}
  role="alertdialog"
  severity="danger"
  title={$t("lms.students.delete.title", { count: students.length })}
  confirmText={scanned.length ? $t("lms.students.delete.confirmScanned") : $t("common.delete")}
  cancelText={$t("common.cancel")}
  {busy}
  {error}
  confirmDisabled={scanned.length > 0 && !understood}
  onConfirm={remove}
  {onCancel}
>
  <div class="flex flex-col gap-3 text-sm">
    <p class="m-0">{names}</p>
    {#if scanned.length}
      <p class="m-0 font-semibold text-danger-fg">
        {$t("lms.students.delete.scanned", { count: scanned.length })}
        {#if gradedCount}{$t("lms.students.delete.graded", { count: gradedCount })}{/if}
      </p>
      <p class="m-0">{$t("lms.students.delete.consequences")}</p>
      {#if onMergeInstead}
        <p class="m-0 text-warning-fg">{$t("lms.students.delete.duplicateHint")} <button type="button" class="text-accent underline" onclick={onMergeInstead}>{$t("lms.students.merge.action")}</button></p>
      {/if}
      <Checkbox bind:checked={understood} label={$t("lms.students.delete.understood")} />
    {:else}
      <p class="m-0">{$t("lms.students.delete.listOnly")}</p>
    {/if}
    <p class="m-0 text-muted">{$t("common.trashHint", { days: TRASH_DAYS })}</p>
  </div>
</ConfirmDialog>
