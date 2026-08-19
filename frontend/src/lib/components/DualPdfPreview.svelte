<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { t } from '$lib/i18n';

  export let previewPdfUrl: string | null = null;
  export let previewSolutionPdfUrl: string | null = null;
  export let showAngabePreview: boolean = true;
  export let showLoesungPreview: boolean = false;
  // Left undefined so the catalog default stays reactive to the language
  // switch; callers can still pass an explicit pane title.
  export let titleAngabe: string | undefined = undefined;
  export let titleLoesung: string | undefined = undefined;
  export let emojiAngabe: string = "📄";
  export let emojiLoesung: string = "📝";
  export let height: string = "100%";
  export let placeholderText: string | undefined = undefined;

  $: angabeTitle = titleAngabe ?? $t("editor.pdfPreview.titleAngabe");
  $: loesungTitle = titleLoesung ?? $t("editor.pdfPreview.titleLoesung");
  $: placeholder = placeholderText ?? $t("editor.pdfPreview.placeholder");

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
  class="flex flex-1 min-w-0 w-full gap-2 overflow-hidden"
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
        title={$t("editor.pdfPreview.collapse", { title: angabeTitle })}
      >
        <span class="truncate text-sm font-medium">{emojiAngabe} {angabeTitle}</span>
        <span class="text-slate-400">›</span>
      </button>
      <div class="min-h-0 flex-1">
        {#if previewPdfUrl}
          <iframe
            src={previewPdfUrl}
            title={$t("editor.pdfPreview.frameTitle", { title: angabeTitle })}
            width="100%"
            height="100%"
          ></iframe>
        {:else}
          <div class="flex h-full items-center justify-center p-4 text-center text-sm text-slate-500">
            {placeholder}
          </div>
        {/if}
      </div>
    {:else}
      <button
        type="button"
        class="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-800 py-3 text-slate-300 hover:bg-slate-700"
        on:click={handleToggleAngabe}
        title={$t("editor.pdfPreview.expand", { title: angabeTitle })}
      >
        <span class="text-slate-400">‹</span>
        <span>{emojiAngabe}</span>
        <span class="[writing-mode:vertical-rl] text-xs">{angabeTitle} PDF</span>
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
        title={$t("editor.pdfPreview.collapse", { title: loesungTitle })}
      >
        <span class="truncate text-sm font-medium">{emojiLoesung} {loesungTitle}</span>
        <span class="text-slate-400">›</span>
      </button>
      <div class="min-h-0 flex-1">
        {#if previewSolutionPdfUrl}
          <iframe
            src={previewSolutionPdfUrl}
            title={$t("editor.pdfPreview.frameTitle", { title: loesungTitle })}
            width="100%"
            height="100%"
          ></iframe>
        {:else}
          <div class="flex h-full items-center justify-center p-4 text-center text-sm text-slate-500">
            {placeholder}
          </div>
        {/if}
      </div>
    {:else}
      <button
        type="button"
        class="flex h-full w-full flex-col items-center justify-center gap-2 bg-slate-800 py-3 text-slate-300 hover:bg-slate-700"
        on:click={handleToggleLoesung}
        title={$t("editor.pdfPreview.expand", { title: loesungTitle })}
      >
        <span class="text-slate-400">‹</span>
        <span>{emojiLoesung}</span>
        <span class="[writing-mode:vertical-rl] text-xs">{loesungTitle} PDF</span>
      </button>
    {/if}
  </div>
</div>
