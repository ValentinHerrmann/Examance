<script lang="ts">
  import DualPdfPreview from "$lib/components/DualPdfPreview.svelte";
  import { t } from "$lib/i18n";
  import { Card } from "$lib/components/ui";

  export let previewPdfUrl: string | null;
  export let previewSolutionPdfUrl: string | null;
  export let showAngabePreview: boolean;
  export let showLoesungPreview: boolean;
</script>

{#if previewPdfUrl || previewSolutionPdfUrl}
  <Card title={$t("examCreation.livePreviewPanel.heading")} class="mb-6">
    <DualPdfPreview
      {previewPdfUrl}
      {previewSolutionPdfUrl}
      bind:showAngabePreview
      bind:showLoesungPreview
      titleAngabe={$t("examCreation.livePreviewPanel.titleAngabe")}
      titleLoesung={$t("examCreation.livePreviewPanel.titleLoesung")}
      height="600px"
      placeholderText={$t("examCreation.livePreviewPanel.placeholderText")}
    />
  </Card>
{/if}
