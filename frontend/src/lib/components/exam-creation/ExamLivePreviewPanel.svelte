<script lang="ts">
  import "./ExamLivePreviewPanel.css";
  import DualPdfPreview from "$lib/components/DualPdfPreview.svelte";
  import { t } from "$lib/i18n";

  export let previewPdfUrl: string | null;
  export let previewSolutionPdfUrl: string | null;
  export let showAngabePreview: boolean;
  export let showLoesungPreview: boolean;
</script>

{#if previewPdfUrl || previewSolutionPdfUrl}
  <div class="exam-live-preview-container">
    <h4>{$t("examCreation.livePreviewPanel.heading")}</h4>
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
  </div>
{/if}
