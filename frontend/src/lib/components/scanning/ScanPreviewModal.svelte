<script lang="ts">
  import ZoomableImage from "$lib/components/ZoomableImage.svelte";
  import PdfEmbedViewer from "$lib/components/PdfEmbedViewer.svelte";
  import { t } from "$lib/i18n";
  import { faDownload } from "@fortawesome/free-solid-svg-icons";
  import { Button, Modal } from "$lib/components/ui";

  interface ScannedSubmissionItem {
    id: string;
    pseudonymHash: string;
    fallbackCode: string;
    studentName?: string;
    studentNumber?: string;
    createdAt: string;
    scanCt?: Uint8Array;
    scanIv?: Uint8Array;
    totalScore?: number;
    annotationCt?: Uint8Array;
    annotationIv?: Uint8Array;
  }

  export let open: boolean = false;
  export let item: ScannedSubmissionItem | null = null;
  export let objectUrl: string | null = null;
  export let isPdf: boolean = false;
  export let loading: boolean = false;
  export let error: string = "";
  export let onClose: () => void;

  $: modalTitle = $t("scanning.previewModal.title", { label: item?.fallbackCode || item?.id || "" });
  $: downloadName = `${item?.fallbackCode || item?.id || "scan"}.${isPdf ? "pdf" : "png"}`;
</script>

<Modal {open} size="full" bare onClose={onClose}>
  <svelte:fragment slot="header">
    <h2 class="m-0 min-w-0 truncate text-base font-semibold text-content sm:text-lg">{modalTitle}</h2>
    {#if objectUrl}
      <Button
        variant="outlined"
        severity="secondary"
        size="sm"
        icon={faDownload}
        href={objectUrl}
        title={$t("common.download")}
        class="ml-2"
        download={downloadName}
      >
        {$t("common.download")}
      </Button>
    {/if}
  </svelte:fragment>

  <div class="flex h-full min-h-72 items-center justify-center p-4 sm:p-6">
    {#if loading}
      <div class="font-medium text-muted">{$t("scanning.previewModal.decrypting")}</div>
    {:else if error}
      <div class="font-medium text-danger-fg">{error}</div>
    {:else if objectUrl}
      {#if isPdf}
        <div class="h-full w-full rounded-md" role="group" aria-label={$t("scanning.previewModal.pdfTitle")}>
          <PdfEmbedViewer src={objectUrl} />
        </div>
      {:else}
        <ZoomableImage src={objectUrl} alt={$t("scanning.previewModal.imageAlt")} />
      {/if}
    {/if}
  </div>
</Modal>
