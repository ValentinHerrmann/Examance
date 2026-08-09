<script lang="ts">
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
  class="flex w-full gap-2 overflow-hidden"
  style="height: {height};"
>
  <!-- Tab 1: Angabe / Exercise / Exam -->
  <div
    class="flex flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 transition-all duration-200"
    class:flex-1={showAngabePreview}
    class:min-w-0={showAngabePreview}
    class:w-10={!showAngabePreview}
    class:shrink-0={!showAngabePreview}
  >
    {#if showAngabePreview}
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 border-b border-slate-700 bg-slate-800 px-3 py-2 text-left text-slate-200 hover:bg-slate-700"
        on:click={handleToggleAngabe}
        title="Click to collapse {titleAngabe} PDF"
      >
        <span class="truncate text-sm font-medium">{emojiAngabe} {titleAngabe}</span>
        <span class="text-slate-400">›</span>
      </button>
      <div class="min-h-0 flex-1">
        {#if previewPdfUrl}
          <iframe
            src={previewPdfUrl}
            title="{titleAngabe} Preview"
            width="100%"
            height="100%"
          ></iframe>
        {:else}
          <div class="flex h-full items-center justify-center p-4 text-center text-sm text-slate-500">
            {placeholderText}
          </div>
        {/if}
      </div>
    {:else}
      <button
        type="button"
        class="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-800 py-3 text-slate-300 hover:bg-slate-700"
        on:click={handleToggleAngabe}
        title="Click to expand {titleAngabe} PDF"
      >
        <span class="text-slate-400">‹</span>
        <span>{emojiAngabe}</span>
        <span class="[writing-mode:vertical-rl] text-xs">{titleAngabe} PDF</span>
      </button>
    {/if}
  </div>

  <!-- Tab 2: Lösung / Solution / Answer Key -->
  <div
    class="flex flex-col overflow-hidden rounded-lg border border-slate-700 bg-slate-900 transition-all duration-200"
    class:flex-1={showLoesungPreview}
    class:min-w-0={showLoesungPreview}
    class:w-10={!showLoesungPreview}
    class:shrink-0={!showLoesungPreview}
  >
    {#if showLoesungPreview}
      <button
        type="button"
        class="flex w-full items-center justify-between gap-2 border-b border-slate-700 bg-slate-800 px-3 py-2 text-left text-slate-200 hover:bg-slate-700"
        on:click={handleToggleLoesung}
        title="Click to collapse {titleLoesung} PDF"
      >
        <span class="truncate text-sm font-medium">{emojiLoesung} {titleLoesung}</span>
        <span class="text-slate-400">›</span>
      </button>
      <div class="min-h-0 flex-1">
        {#if previewSolutionPdfUrl}
          <iframe
            src={previewSolutionPdfUrl}
            title="{titleLoesung} Preview"
            width="100%"
            height="100%"
          ></iframe>
        {:else}
          <div class="flex h-full items-center justify-center p-4 text-center text-sm text-slate-500">
            {placeholderText}
          </div>
        {/if}
      </div>
    {:else}
      <button
        type="button"
        class="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-800 py-3 text-slate-300 hover:bg-slate-700"
        on:click={handleToggleLoesung}
        title="Click to expand {titleLoesung} PDF"
      >
        <span class="text-slate-400">‹</span>
        <span>{emojiLoesung}</span>
        <span class="[writing-mode:vertical-rl] text-xs">{titleLoesung} PDF</span>
      </button>
    {/if}
  </div>
</div>
