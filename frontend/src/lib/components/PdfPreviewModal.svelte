<script lang="ts">
  import { t } from "$lib/i18n";
  import DualPdfPreview from "$lib/components/DualPdfPreview.svelte";
  import { Alert, Button, Modal, Spinner } from "$lib/components/ui";

  export let open = false;
  export let title: string;
  export let angabeUrl: string | null = null;
  export let loesungUrl: string | null = null;
  /** Shown while a compile is running. */
  export let busy = false;
  export let notice = "";
  export let error = "";
  export let onClose: () => void;

  let showLoesung = false;
</script>

<Modal {open} size="large" {title} {onClose} closeOnBackdrop>
  {#if error}
    <div class="mb-3"><Alert severity="danger">{error}</Alert></div>
  {/if}
  {#if busy}
    <div class="flex items-center gap-3 p-8 text-muted">
      <Spinner />
      <span>{notice || $t("common.previewCompiling")}</span>
    </div>
  {:else}
    <DualPdfPreview
      previewPdfUrl={angabeUrl}
      previewSolutionPdfUrl={loesungUrl}
      showAngabePreview={true}
      bind:showLoesungPreview={showLoesung}
      height="65dvh"
    />
  {/if}
  <svelte:fragment slot="footer">
    <Button variant="text" severity="secondary" onClick={onClose}>{$t("common.close")}</Button>
  </svelte:fragment>
</Modal>
