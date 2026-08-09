<script lang="ts">
  import "./ScanPreviewModal.css";
  import ZoomableImage from "$lib/components/ZoomableImage.svelte";

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
        <h3>Scan Preview — {item?.fallbackCode || item?.id}</h3>
        <button class="scan-preview-modal-close-btn" on:click={onClose}>&times;</button>
      </div>
      <div class="scan-preview-modal-body">
        {#if loading}
          <div class="preview-status">Decrypting scan...</div>
        {:else if error}
          <div class="preview-error">{error}</div>
        {:else if objectUrl}
          {#if isPdf}
            <object data={objectUrl} type="application/pdf" class="preview-pdf">
              <iframe src={objectUrl} title="Scan PDF Preview" class="preview-pdf"></iframe>
            </object>
          {:else}
            <ZoomableImage src={objectUrl} alt="Decrypted Scan Preview" />
          {/if}
        {/if}
      </div>
    </div>
  </div>
{/if}
