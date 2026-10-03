<script lang="ts">
  import DualPdfPreview from "#lib/components/DualPdfPreview.svelte";
  import { t } from "#lib/i18n";
  import { Card } from "#lib/components/ui";

  interface Props {
    previewPdfUrl: string | null;
    previewSolutionPdfUrl: string | null;
    showAngabePreview: boolean;
    showLoesungPreview: boolean;
  }

  let {
    previewPdfUrl,
    previewSolutionPdfUrl,
    showAngabePreview = $bindable(),
    showLoesungPreview = $bindable()
  }: Props = $props();
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
