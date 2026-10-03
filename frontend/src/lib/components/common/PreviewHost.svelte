<script lang="ts">
  import { onDestroy } from "svelte";
  import { t } from "$lib/i18n";
  import type { PreviewFlow } from "$lib/stores/previewFlow";
  import PdfPreviewModal from "$lib/components/PdfPreviewModal.svelte";
  import { ConfirmDialog } from "$lib/components/ui";

  /** Renders a createPreviewFlow(): the "compile now?" prompt and the PDF modal. */
  export let flow: PreviewFlow<any>;

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
  notice={$flow.notice}
  error={$flow.error}
  onClose={() => flow.close()}
/>
