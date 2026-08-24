<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { t } from "$lib/i18n";
  import { isDesktop } from "$lib/stores/viewport";
  import PdfEmbedViewer from "$lib/components/PdfEmbedViewer.svelte";

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
    dispatch("toggleAngabe", showAngabePreview);
  }

  function handleToggleLoesung() {
    showLoesungPreview = !showLoesungPreview;
    dispatch("toggleLoesung", showLoesungPreview);
  }

  /* Below `lg` two PDF iframes side by side are unreadable, so the split
   * becomes a segmented switch over a single pane. Callers still pass a pixel
   * height; it is capped against the viewport so the preview cannot grow taller
   * than the screen on a phone. */
  type PaneId = "angabe" | "loesung";
  let mobilePane: PaneId = "angabe";

  $: panes = [
    { id: "angabe" as PaneId, title: angabeTitle, emoji: emojiAngabe, url: previewPdfUrl },
    {
      id: "loesung" as PaneId,
      title: loesungTitle,
      emoji: emojiLoesung,
      url: previewSolutionPdfUrl,
    },
  ];

  $: activePane = panes.find((p) => p.id === mobilePane) ?? panes[0];

  // Keep the desktop visibility flags (and their events) in step with the
  // mobile switch, so a caller that reads them sees the same selection.
  function selectMobilePane(id: PaneId) {
    mobilePane = id;
    if (id === "angabe" && !showAngabePreview) {
      handleToggleAngabe();
    }
    if (id === "loesung" && !showLoesungPreview) {
      handleToggleLoesung();
    }
  }

  const paneShell =
    "flex flex-col overflow-hidden rounded-lg border border-line bg-surface-base transition-all duration-200";
  const paneHeader =
    "flex w-full items-center justify-between gap-2 border-b border-line bg-surface-raised px-3 py-2 text-left text-slate-200 hover:bg-line-strong";
</script>

{#if $isDesktop}
  <div class="flex w-full min-w-0 flex-1 gap-2 overflow-hidden" style="height: {height};">
    <!-- Pane 1: Angabe / Exercise / Exam -->
    <div
      class={paneShell}
      class:flex-1={showAngabePreview}
      class:min-w-0={showAngabePreview}
      class:w-10={!showAngabePreview}
      class:shrink-0={!showAngabePreview}
    >
      {#if showAngabePreview}
        <div class="flex w-full items-center justify-between gap-2 border-b border-line bg-surface-raised px-3 py-1.5 text-slate-200">
          <button
            type="button"
            class="flex flex-1 items-center gap-2 truncate text-left hover:text-white"
            on:click={handleToggleAngabe}
            title={$t("editor.pdfPreview.collapse", { title: angabeTitle })}
          >
            <span class="truncate text-sm font-medium">{emojiAngabe} {angabeTitle}</span>
          </button>
          <div class="flex shrink-0 items-center gap-2">
            {#if previewPdfUrl}
              <a
                href={previewPdfUrl}
                download={`${angabeTitle}.pdf`}
                class="flex items-center gap-1 rounded border border-line bg-surface-inset px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-line-strong hover:text-white"
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
              class="px-1 text-muted hover:text-white"
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
            <div class="flex h-full items-center justify-center p-4 text-center text-sm text-subtle">
              {placeholder}
            </div>
          {/if}
        </div>
      {:else}
        <button
          type="button"
          class="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-raised py-3 text-slate-300 hover:bg-line-strong"
          on:click={handleToggleAngabe}
          title={$t("editor.pdfPreview.expand", { title: angabeTitle })}
        >
          <span class="text-muted">‹</span>
          <span>{emojiAngabe}</span>
          <span class="text-xs [writing-mode:vertical-rl]">{angabeTitle} PDF</span>
        </button>
      {/if}
    </div>

    <!-- Pane 2: Lösung / Solution / Answer Key -->
    <div
      class={paneShell}
      class:flex-1={showLoesungPreview}
      class:min-w-0={showLoesungPreview}
      class:w-10={!showLoesungPreview}
      class:shrink-0={!showLoesungPreview}
    >
      {#if showLoesungPreview}
        <div class="flex w-full items-center justify-between gap-2 border-b border-line bg-surface-raised px-3 py-1.5 text-slate-200">
          <button
            type="button"
            class="flex flex-1 items-center gap-2 truncate text-left hover:text-white"
            on:click={handleToggleLoesung}
            title={$t("editor.pdfPreview.collapse", { title: loesungTitle })}
          >
            <span class="truncate text-sm font-medium">{emojiLoesung} {loesungTitle}</span>
          </button>
          <div class="flex shrink-0 items-center gap-2">
            {#if previewSolutionPdfUrl}
              <a
                href={previewSolutionPdfUrl}
                download={`${loesungTitle}.pdf`}
                class="flex items-center gap-1 rounded border border-line bg-surface-inset px-2 py-1 text-xs text-slate-300 transition-colors hover:bg-line-strong hover:text-white"
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
              class="px-1 text-muted hover:text-white"
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
            <div class="flex h-full items-center justify-center p-4 text-center text-sm text-subtle">
              {placeholder}
            </div>
          {/if}
        </div>
      {:else}
        <button
          type="button"
          class="flex h-full w-full flex-col items-center justify-center gap-2 bg-surface-raised py-3 text-slate-300 hover:bg-line-strong"
          on:click={handleToggleLoesung}
          title={$t("editor.pdfPreview.expand", { title: loesungTitle })}
        >
          <span class="text-muted">‹</span>
          <span>{emojiLoesung}</span>
          <span class="text-xs [writing-mode:vertical-rl]">{loesungTitle} PDF</span>
        </button>
      {/if}
    </div>
  </div>
{:else}
  <div
    class="flex w-full min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-line bg-surface-base"
    style="height: min(70dvh, {height}); min-height: 18rem;"
  >
    <div class="flex shrink-0 gap-1 border-b border-line bg-surface-raised p-1" role="tablist">
      {#each panes as pane (pane.id)}
        <button
          type="button"
          role="tab"
          aria-selected={mobilePane === pane.id}
          class="min-h-9 flex-1 truncate rounded-md px-3 py-2 text-sm font-medium transition-colors
            {mobilePane === pane.id
            ? 'bg-accent-strong text-white'
            : 'text-slate-300 hover:bg-surface-inset'}"
          on:click={() => selectMobilePane(pane.id)}
        >
          {pane.emoji} {pane.title}
        </button>
      {/each}
    </div>

    <div class="min-h-0 flex-1" role="group" aria-label={$t("editor.pdfPreview.frameTitle", { title: activePane.title })}>
      {#if activePane.url}
        <PdfEmbedViewer src={activePane.url} />
      {:else}
        <div class="flex h-full items-center justify-center p-4 text-center text-sm text-subtle">
          {placeholder}
        </div>
      {/if}
    </div>
  </div>
{/if}
