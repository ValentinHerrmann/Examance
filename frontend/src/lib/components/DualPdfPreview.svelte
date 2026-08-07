<script lang="ts">
  import './DualPdfPreview.css';
  import { createEventDispatcher } from 'svelte';

  export let previewPdfUrl: string | null = null;
  export let previewSolutionPdfUrl: string | null = null;
  export let showAngabePreview: boolean = true;
  export let showLoesungPreview: boolean = false;
  export let titleAngabe: string = "Exercise";
  export let titleLoesung: string = "Solution";
  export let emojiAngabe: string = "📄";
  export let emojiLoesung: string = "📝";
  export let height: string = "100%";
  export let placeholderText: string = "Click compile to render preview";

  const dispatch = createEventDispatcher<{
    toggleAngabe: boolean;
    toggleLoesung: boolean;
  }>();

  function handleToggleAngabe() {
    showAngabePreview = !showAngabePreview;
    dispatch('toggleAngabe', showAngabePreview);
  }

  function handleToggleLoesung() {
    showLoesungPreview = !showLoesungPreview;
    dispatch('toggleLoesung', showLoesungPreview);
  }
</script>

<div
  class="dual-pdf-preview-previews-container"
  class:dual-pdf-preview-all-collapsed={!showAngabePreview && !showLoesungPreview}
  style="height: {height};"
>
  <!-- Tab 1: Angabe / Exercise / Exam -->
  <div
    class="dual-pdf-preview-pdf-panel"
    class:dual-pdf-preview-expanded={showAngabePreview}
    class:dual-pdf-preview-collapsed={!showAngabePreview}
  >
    {#if showAngabePreview}
      <button
        type="button"
        class="dual-pdf-preview-pdf-panel-header"
        on:click={handleToggleAngabe}
        title="Click to collapse {titleAngabe} PDF"
      >
        <span class="dual-pdf-preview-panel-title">{emojiAngabe} {titleAngabe}</span>
        <span class="dual-pdf-preview-header-icon">›</span>
      </button>
      <div class="dual-pdf-preview-pdf-panel-body">
        {#if previewPdfUrl}
          <iframe
            src={previewPdfUrl}
            title="{titleAngabe} Preview"
            width="100%"
            height="100%"
          ></iframe>
        {:else}
          <div class="dual-pdf-preview-preview-placeholder">
            {placeholderText}
          </div>
        {/if}
      </div>
    {:else}
      <button
        type="button"
        class="dual-pdf-preview-vertical-header-strip"
        on:click={handleToggleAngabe}
        title="Click to expand {titleAngabe} PDF"
      >
        <span class="dual-pdf-preview-strip-icon">‹</span>
        <span class="dual-pdf-preview-strip-emoji">{emojiAngabe}</span>
        <span class="dual-pdf-preview-strip-title">{titleAngabe} PDF</span>
      </button>
    {/if}
  </div>

  <!-- Tab 2: Lösung / Solution / Answer Key -->
  <div
    class="dual-pdf-preview-pdf-panel"
    class:dual-pdf-preview-expanded={showLoesungPreview}
    class:dual-pdf-preview-collapsed={!showLoesungPreview}
  >
    {#if showLoesungPreview}
      <button
        type="button"
        class="dual-pdf-preview-pdf-panel-header"
        on:click={handleToggleLoesung}
        title="Click to collapse {titleLoesung} PDF"
      >
        <span class="dual-pdf-preview-panel-title">{emojiLoesung} {titleLoesung}</span>
        <span class="dual-pdf-preview-header-icon">›</span>
      </button>
      <div class="dual-pdf-preview-pdf-panel-body">
        {#if previewSolutionPdfUrl}
          <iframe
            src={previewSolutionPdfUrl}
            title="{titleLoesung} Preview"
            width="100%"
            height="100%"
          ></iframe>
        {:else}
          <div class="dual-pdf-preview-preview-placeholder">
            {placeholderText}
          </div>
        {/if}
      </div>
    {:else}
      <button
        type="button"
        class="dual-pdf-preview-vertical-header-strip"
        on:click={handleToggleLoesung}
        title="Click to expand {titleLoesung} PDF"
      >
        <span class="dual-pdf-preview-strip-icon">‹</span>
        <span class="dual-pdf-preview-strip-emoji">{emojiLoesung}</span>
        <span class="dual-pdf-preview-strip-title">{titleLoesung} PDF</span>
      </button>
    {/if}
  </div>
</div>
