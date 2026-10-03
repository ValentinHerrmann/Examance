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

  interface Props {
    open?: boolean;
    item?: ScannedSubmissionItem | null;
    objectUrl?: string | null;
    isPdf?: boolean;
    loading?: boolean;
    error?: string;
    onClose: () => void;
  }

  let {
    open = false,
    item = null,
    objectUrl = null,
    isPdf = false,
    loading = false,
    error = "",
    onClose
  }: Props = $props();

  let modalTitle = $derived($t("scanning.previewModal.title", { label: item?.fallbackCode || item?.id || "" }));
  let downloadName = $derived(`${item?.fallbackCode || item?.id || "scan"}.${isPdf ? "pdf" : "png"}`);
</script>

<Modal {open} size="full" bare onClose={onClose}>
  {#snippet header()}

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

  {/snippet}

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
