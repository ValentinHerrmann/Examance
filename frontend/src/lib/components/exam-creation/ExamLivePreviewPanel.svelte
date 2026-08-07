<script lang="ts">
  import DualPdfPreview from "$lib/components/DualPdfPreview.svelte";

  export let previewPdfUrl: string | null;
  export let previewSolutionPdfUrl: string | null;
  export let showAngabePreview: boolean;
  export let showLoesungPreview: boolean;
</script>

{#if previewPdfUrl || previewSolutionPdfUrl}
  <div class="preview-container">
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

<style>
  .preview-container {
    background: #1e293b;
    border: 1px solid #0284c7;
    border-radius: 10px;
    padding: 1rem;
    margin-bottom: 1.5rem;
  }

  .preview-container h4 {
    margin-top: 0;
    color: #38bdf8;
  }
</style>
