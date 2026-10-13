<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { t } from "#lib/i18n";
  import { Alert } from "#lib/components/ui";
  import ExportOptionsModal, { type ExportOption } from "#lib/components/export/ExportOptionsModal.svelte";
  import { loadExamExercisesEncrypted } from "#lib/db/dbEncryption";
  import { examHasWithheldCode } from "#lib/exam/examPreview";
  import { runExamExport } from "#lib/export/examExport";
  import { awaitSessionReady, sessionStore } from "#lib/stores/session";

  interface Props {
    examId: string;
    onClose: () => void;
  }

  let { examId, onClose }: Props = $props();

  // Null until known: ExportOptionsModal reads its options once, when it mounts.
  let withheld: boolean | null = $state(null);

  onMount(async () => {
    try {
      await awaitSessionReady();
      withheld = examHasWithheldCode(await loadExamExercisesEncrypted(examId, get(sessionStore).sessionKey));
    } catch {
      withheld = false;
    }
  });

  let options: ExportOption[] = $derived([
    { key: "graded", label: $t("export.exam.options.graded"), hint: $t("export.exam.options.gradedHint") },
    {
      key: "latex",
      label: $t("export.exam.options.latex"),
      hint: withheld ? $t("export.exam.options.withheld") : $t("export.exam.options.latexHint"),
      disabled: !!withheld,
    },
    {
      key: "pdf",
      label: $t("export.exam.options.pdf"),
      hint: withheld ? $t("export.exam.options.withheld") : $t("export.exam.options.pdfHint"),
      disabled: !!withheld,
    },
    { key: "summary", label: $t("export.exam.options.summary"), hint: $t("export.exam.options.summaryHint") },
    { key: "csv", label: $t("export.exam.options.csv"), hint: $t("export.exam.options.csvHint") },
  ]);
</script>

{#if withheld !== null}
  <ExportOptionsModal
    title={$t("export.exam.title")}
    {options}
    run={(selected, progress) => runExamExport(examId, selected, progress)}
    {onClose}
  >
    {#snippet notice()}
      <Alert severity="warning" class="mb-4">{$t("export.exam.notice")}</Alert>
    {/snippet}
  </ExportOptionsModal>
{/if}
