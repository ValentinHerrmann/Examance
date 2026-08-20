<script lang="ts">
  import ZoomableImage from "$lib/components/ZoomableImage.svelte";
  import PdfEmbedViewer from "$lib/components/PdfEmbedViewer.svelte";
  import { t } from "$lib/i18n";
  import { Modal } from "$lib/components/ui";

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

<Modal {open} size="lg" bare onClose={onClose}>
  <svelte:fragment slot="header">
    <h2 class="m-0 min-w-0 truncate text-base font-semibold text-accent sm:text-lg">{modalTitle}</h2>
    {#if objectUrl}
      <a
        href={objectUrl}
        download={downloadName}
        class="ml-2 flex shrink-0 items-center gap-1 rounded border border-line bg-surface-inset px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-line-strong hover:text-white"
        title={$t("common.download")}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        <span>{$t("common.download")}</span>
      </a>
    {/if}
  </svelte:fragment>

  <div class="flex min-h-[300px] items-center justify-center p-6">
    {#if loading}
      <div class="font-medium text-accent">{$t("scanning.previewModal.decrypting")}</div>
    {:else if error}
      <div class="font-medium text-red-400">{error}</div>
    {:else if objectUrl}
      {#if isPdf}
        <div class="h-[70dvh] max-h-full w-full rounded-lg" role="group" aria-label={$t("scanning.previewModal.pdfTitle")}>
          <PdfEmbedViewer src={objectUrl} />
        </div>
      {:else}
        <ZoomableImage src={objectUrl} alt={$t("scanning.previewModal.imageAlt")} />
      {/if}
    {/if}
  </div>
</Modal>
