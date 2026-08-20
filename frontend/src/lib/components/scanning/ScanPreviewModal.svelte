<script lang="ts">
  import "./ScanPreviewModal.css";
  import ZoomableImage from "$lib/components/ZoomableImage.svelte";
  import PdfEmbedViewer from "$lib/components/PdfEmbedViewer.svelte";
  import { t } from "$lib/i18n";

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
</script>

{#if open}
  <div class="scan-preview-modal-backdrop" on:click={onClose} role="presentation">
    <div class="scan-preview-modal-card" on:click|stopPropagation role="dialog" aria-modal="true">
      <div class="scan-preview-modal-header">
        <h3>{$t("scanning.previewModal.title", { label: item?.fallbackCode || item?.id || "" })}</h3>
        <div class="scan-preview-modal-actions">
          {#if objectUrl}
            <a
              href={objectUrl}
              download={`${item?.fallbackCode || item?.id || "scan"}.${isPdf ? "pdf" : "png"}`}
              class="scan-preview-modal-download-btn"
              title={$t("common.download")}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{$t("common.download")}</span>
            </a>
          {/if}
          <button class="scan-preview-modal-close-btn" on:click={onClose}>&times;</button>
        </div>
      </div>
      <div class="scan-preview-modal-body">
        {#if loading}
          <div class="preview-status">{$t("scanning.previewModal.decrypting")}</div>
        {:else if error}
          <div class="preview-error">{error}</div>
        {:else if objectUrl}
          {#if isPdf}
            <div class="preview-pdf" role="group" aria-label={$t("scanning.previewModal.pdfTitle")}>
              <PdfEmbedViewer src={objectUrl} />
            </div>
          {:else}
            <ZoomableImage src={objectUrl} alt={$t("scanning.previewModal.imageAlt")} />
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}
