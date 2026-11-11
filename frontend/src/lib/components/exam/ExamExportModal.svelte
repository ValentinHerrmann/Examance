<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { t } from "#lib/i18n";
  import { Alert } from "#lib/components/ui";
  import ExportOptionsModal, { type ExportOption } from "#lib/components/export/ExportOptionsModal.svelte";
  import { loadExamExercisesEncrypted } from "#lib/db/dbEncryption";
  import { examHasWithheldCode } from "#lib/exam/examPreview";
  import { runExamsExport } from "#lib/export/examExport";
  import { examExportOptions } from "#lib/export/examExportOptions";
  import { awaitSessionReady, sessionStore } from "#lib/stores/session";
  import { examStepHref } from "#lib/components/layout/examNavItems";

  interface Props {
    /** One exam, or several exported together (one ZIP with a folder per exam, issue #261). */
    exams: { id: string; title: string }[];
    onClose: () => void;
  }

  let { exams, onClose }: Props = $props();

  // Null until known: ExportOptionsModal reads its options once, when it mounts.
  let withheld: boolean | null = $state(null);

  onMount(async () => {
    try {
      await awaitSessionReady();
      const key = get(sessionStore).sessionKey;
      const lists = await Promise.all(exams.map((exam) => loadExamExercisesEncrypted(exam.id, key)));
      withheld = lists.some((list) => examHasWithheldCode(list));
    } catch {
      withheld = false;
    }
  });

  let options: ExportOption[] = $derived(examExportOptions(!!withheld, $t));
</script>

{#if withheld !== null}
  <ExportOptionsModal
    title={$t("export.exam.title")}
    {options}
    run={(selected, progress) => runExamsExport(exams, selected, progress)}
    backup={{ examIds: exams.map((exam) => exam.id), name: exams.length === 1 ? exams[0].title || "exam" : "exams" }}
    {onClose}
  >
    {#snippet notice()}
      {#if exams.length === 1}
        <Alert severity="info" class="mb-4">
          {$t("exam.overview.backupHint")}
          <a href={`${examStepHref(exams[0].id, "results")}/archive`} onclick={onClose}>{$t("exam.overview.backupArchiveLink")}</a>
        </Alert>
      {:else}
        <Alert severity="info" class="mb-4">{$t("export.exam.manyHint", { count: exams.length })}</Alert>
      {/if}
      <Alert severity="warning" class="mb-4">{$t("export.exam.notice")}</Alert>
    {/snippet}
  </ExportOptionsModal>
{/if}
