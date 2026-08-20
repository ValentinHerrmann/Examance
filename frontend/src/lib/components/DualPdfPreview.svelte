<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { t } from '$lib/i18n';
  import PdfEmbedViewer from '$lib/components/PdfEmbedViewer.svelte';

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
      <div class="flex w-full items-center justify-between gap-2 border-b border-slate-700 bg-slate-800 px-3 py-1.5 text-slate-200">
        <button
          type="button"
          class="flex flex-1 items-center gap-2 text-left hover:text-white truncate"
          on:click={handleToggleAngabe}
          title={$t("editor.pdfPreview.collapse", { title: angabeTitle })}
        >
          <span class="truncate text-sm font-medium">{emojiAngabe} {angabeTitle}</span>
        </button>
        <div class="flex items-center gap-2 shrink-0">
          {#if previewPdfUrl}
            <a
              href={previewPdfUrl}
              download={`${angabeTitle}.pdf`}
              class="flex items-center gap-1 text-xs text-slate-300 hover:text-white bg-slate-700/60 hover:bg-slate-700 border border-slate-600 px-2 py-1 rounded transition-colors"
              title={$t("common.download")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{$t("common.download")}</span>
            </a>
          {/if}
          <button
            type="button"
            class="text-slate-400 hover:text-white px-1"
            on:click={handleToggleAngabe}
            title={$t("editor.pdfPreview.collapse", { title: angabeTitle })}
          >
            ›
          </button>
        </div>
      </div>
      <div class="min-h-0 flex-1" role="group" aria-label={$t("editor.pdfPreview.frameTitle", { title: angabeTitle })}>
        {#if previewPdfUrl}
          <PdfEmbedViewer src={previewPdfUrl} />
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
      <div class="flex w-full items-center justify-between gap-2 border-b border-slate-700 bg-slate-800 px-3 py-1.5 text-slate-200">
        <button
          type="button"
          class="flex flex-1 items-center gap-2 text-left hover:text-white truncate"
          on:click={handleToggleLoesung}
          title={$t("editor.pdfPreview.collapse", { title: loesungTitle })}
        >
          <span class="truncate text-sm font-medium">{emojiLoesung} {loesungTitle}</span>
        </button>
        <div class="flex items-center gap-2 shrink-0">
          {#if previewSolutionPdfUrl}
            <a
              href={previewSolutionPdfUrl}
              download={`${loesungTitle}.pdf`}
              class="flex items-center gap-1 text-xs text-slate-300 hover:text-white bg-slate-700/60 hover:bg-slate-700 border border-slate-600 px-2 py-1 rounded transition-colors"
              title={$t("common.download")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>{$t("common.download")}</span>
            </a>
          {/if}
          <button
            type="button"
            class="text-slate-400 hover:text-white px-1"
            on:click={handleToggleLoesung}
            title={$t("editor.pdfPreview.collapse", { title: loesungTitle })}
          >
            ›
          </button>
        </div>
      </div>
      <div class="min-h-0 flex-1" role="group" aria-label={$t("editor.pdfPreview.frameTitle", { title: loesungTitle })}>
        {#if previewSolutionPdfUrl}
          <PdfEmbedViewer src={previewSolutionPdfUrl} />
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
