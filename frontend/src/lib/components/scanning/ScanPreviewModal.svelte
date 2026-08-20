<script lang="ts">
  import ZoomableImage from "$lib/components/ZoomableImage.svelte";
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
</script>

<Modal
  {open}
  size="lg"
  bare
  title={$t("scanning.previewModal.title", { label: item?.fallbackCode || item?.id || "" })}
  onClose={onClose}
>
  <div class="flex min-h-[300px] items-center justify-center p-6">
    {#if loading}
      <div class="font-medium text-accent">{$t("scanning.previewModal.decrypting")}</div>
    {:else if error}
      <div class="font-medium text-red-400">{error}</div>
    {:else if objectUrl}
      {#if isPdf}
        <object data={objectUrl} type="application/pdf" class="h-[70dvh] max-h-full w-full rounded-lg border-0">
          <iframe src={objectUrl} title={$t("scanning.previewModal.pdfTitle")} class="h-[70dvh] max-h-full w-full rounded-lg border-0"></iframe>
        </object>
      {:else}
        <ZoomableImage src={objectUrl} alt={$t("scanning.previewModal.imageAlt")} />
      {/if}
    {/if}
  </div>
</Modal>
