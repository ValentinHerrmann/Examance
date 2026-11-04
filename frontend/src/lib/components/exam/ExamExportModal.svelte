<script lang="ts">
  import { onMount } from "svelte";
  import { get } from "svelte/store";
  import { t } from "#lib/i18n";
  import { Alert } from "#lib/components/ui";
  import ExportOptionsModal, { type ExportOption } from "#lib/components/export/ExportOptionsModal.svelte";
  import { loadExamExercisesEncrypted } from "#lib/db/dbEncryption";
  import { examHasWithheldCode } from "#lib/exam/examPreview";
  import { runExamExport } from "#lib/export/examExport";
  import { examExportOptions } from "#lib/export/examExportOptions";
  import { awaitSessionReady, sessionStore } from "#lib/stores/session";

  interface Props {
    examId: string;
    examTitle: string;
    onClose: () => void;
  }

  let { examId, examTitle, onClose }: Props = $props();

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

  let options: ExportOption[] = $derived(examExportOptions(!!withheld, $t));
</script>

{#if withheld !== null}
  <ExportOptionsModal
    title={$t("export.exam.title")}
    {options}
    run={(selected, progress) => runExamExport(examId, selected, progress)}
    backup={{ examIds: [examId], name: examTitle || "exam" }}
    {onClose}
  >
    {#snippet notice()}
      <Alert severity="warning" class="mb-4">{$t("export.exam.notice")}</Alert>
    {/snippet}
  </ExportOptionsModal>
{/if}
