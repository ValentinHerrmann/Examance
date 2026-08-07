<script lang="ts">
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
  <div class="modal-backdrop" on:click={onClose} role="presentation">
    <div class="modal-card" on:click|stopPropagation role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3>Scan Preview — {item?.fallbackCode || item?.id}</h3>
        <button class="close-btn" on:click={onClose}>&times;</button>
      </div>
      <div class="modal-body">
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

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-card {
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 12px;
    width: 90%;
    max-width: 1100px;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.5rem;
    background: #0f172a;
    border-bottom: 1px solid #334155;
  }

  .modal-header h3 {
    margin: 0;
    color: #38bdf8;
    font-size: 1.1rem;
  }

  .close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 1.5rem;
    cursor: pointer;
    line-height: 1;
  }

  .close-btn:hover {
    color: white;
  }

  .modal-body {
    padding: 1.5rem;
    overflow-y: auto;
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 300px;
  }

  .preview-status {
    color: #38bdf8;
    font-weight: 500;
  }

  .preview-error {
    color: #f87171;
    font-weight: 500;
  }

  .preview-img {
    max-width: 100%;
    max-height: 70vh;
    object-fit: contain;
    border-radius: 8px;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
  }

  .preview-pdf {
    width: 100%;
    height: 75vh;
    border: none;
    border-radius: 8px;
  }
</style>
