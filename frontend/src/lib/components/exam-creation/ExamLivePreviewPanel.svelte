<script lang="ts">
  import "./ExamLivePreviewPanel.css";
  import DualPdfPreview from "$lib/components/DualPdfPreview.svelte";

  export let previewPdfUrl: string | null;
  export let previewSolutionPdfUrl: string | null;
  export let showAngabePreview: boolean;
  export let showLoesungPreview: boolean;
</script>

{#if previewPdfUrl || previewSolutionPdfUrl}
  <div class="exam-live-preview-container">
    <h4>Complete Exam PDF Live Preview</h4>
    <DualPdfPreview
      {previewPdfUrl}
      {previewSolutionPdfUrl}
      bind:showAngabePreview
      bind:showLoesungPreview
      titleAngabe="Exam"
      titleLoesung="Answer Key"
      height="600px"
      placeholderText="Click 'Generate Live Preview' to render"
    />
  </div>
{/if}
