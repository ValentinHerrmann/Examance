<script lang="ts">
  import { onDestroy } from "svelte";
  import { t } from "#lib/i18n";
  import type { PreviewFlow } from "#lib/stores/previewFlow";
  import PdfPreviewModal from "#lib/components/PdfPreviewModal.svelte";
  import { ConfirmDialog } from "#lib/components/ui";
  import LayoutReportButton from "#lib/components/layout-report/LayoutReportButton.svelte";

  interface Props {
    /** Renders a createPreviewFlow(): the "compile now?" prompt and the PDF modal. */
    flow: PreviewFlow<any>;
    /** What the flow previews; needed for the layout report. */
    kind: "exam" | "exercise";
  }

  let { flow, kind }: Props = $props();
  let showReport = $derived(flow.reportable && !$flow.busy && !!($flow.angabeUrl || $flow.loesungUrl || $flow.error));

  onDestroy(() => flow.destroy());
</script>

<ConfirmDialog
  open={$flow.phase === "ask"}
  title={$t("common.previewNoneTitle")}
  message={$t("common.previewNoneText")}
  confirmText={$t("common.previewCompile")}
  cancelText={$t("common.cancel")}
  role="dialog"
  onConfirm={() => flow.confirm()}
  onCancel={() => flow.cancel()}
/>

<PdfPreviewModal
  open={$flow.phase === "open"}
  title={$flow.title}
  angabeUrl={$flow.angabeUrl}
  loesungUrl={$flow.loesungUrl}
  busy={$flow.busy}
  loesungPending={$flow.loesungPending}
  notice={$flow.notice}
  error={$flow.error}
  errorLog={$flow.errorLog}
  report={showReport ? layoutReport : undefined}
  onClose={() => flow.close()}
/>

{#snippet layoutReport()}
  <LayoutReportButton
    {kind}
    title={$flow.title}
    compileError={$flow.error || null}
    disabled={$flow.loesungPending}
    collectFiles={() => flow.reportFiles()}
  />
{/snippet}
