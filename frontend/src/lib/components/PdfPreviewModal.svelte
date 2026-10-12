<script lang="ts">
  import { t } from "#lib/i18n";
  import DualPdfPreview from "#lib/components/DualPdfPreview.svelte";
  import { Alert, Button, Modal, Spinner } from "#lib/components/ui";

  interface Props {
    open?: boolean;
    title: string;
    angabeUrl?: string | null;
    loesungUrl?: string | null;
    /** Shown while a compile is running. */
    busy?: boolean;
    /** The Angabe is shown while the Lösung still compiles. */
    loesungPending?: boolean;
    notice?: string;
    error?: string;
    onClose: () => void;
  }

  let {
    open = false,
    title,
    angabeUrl = null,
    loesungUrl = null,
    busy = false,
    loesungPending = false,
    notice = "",
    error = "",
    onClose
  }: Props = $props();

  let showLoesung = $state(false);
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
    {#if loesungPending}
      <div class="mb-2 flex items-center gap-2 text-sm text-muted">
        <Spinner />
        <span>{$t("common.previewCompilingSolution")}</span>
      </div>
    {/if}
    <DualPdfPreview
      previewPdfUrl={angabeUrl}
      previewSolutionPdfUrl={loesungUrl}
      showAngabePreview={true}
      bind:showLoesungPreview={showLoesung}
      height="65dvh"
    />
  {/if}
  {#snippet footer()}
    <Button variant="text" severity="secondary" onClick={onClose}>{$t("common.close")}</Button>
  {/snippet}
</Modal>
