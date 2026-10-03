<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { t } from "$lib/i18n";
  import { isDesktop } from "$lib/stores/viewport";
  import PdfEmbedViewer from "$lib/components/PdfEmbedViewer.svelte";
  import { faChevronLeft, faChevronRight, faDownload, faFileLines, faFilePdf } from "@fortawesome/free-solid-svg-icons";
  import { Button, Icon, Tabs } from "$lib/components/ui";

  export let previewPdfUrl: string | null = null;
  export let previewSolutionPdfUrl: string | null = null;
  export let showAngabePreview: boolean = true;
  export let showLoesungPreview: boolean = false;
  // Left undefined so the catalog default stays reactive to the language
  // switch; callers can still pass an explicit pane title.
  export let titleAngabe: string | undefined = undefined;
  export let titleLoesung: string | undefined = undefined;
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
    {
      id: "angabe" as PaneId,
      title: angabeTitle,
      icon: faFilePdf,
      url: previewPdfUrl,
      shown: showAngabePreview,
      toggle: handleToggleAngabe,
    },
    {
      id: "loesung" as PaneId,
      title: loesungTitle,
      icon: faFileLines,
      url: previewSolutionPdfUrl,
      shown: showLoesungPreview,
      toggle: handleToggleLoesung,
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
    "flex flex-col overflow-hidden rounded-md border border-line bg-surface-viewer transition-all duration-200";
</script>

{#if $isDesktop}
  <div class="flex w-full min-w-0 flex-1 gap-2 overflow-hidden" style="height: {height};">
    {#each panes as pane (pane.id)}
      <div class="{paneShell} {pane.shown ? 'min-w-0 flex-1' : 'w-10 shrink-0'}">
        {#if pane.shown}
          <div class="flex w-full items-center justify-between gap-2 border-b border-line bg-surface-raised px-3 py-1.5 text-content">
            <button
              type="button"
              class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 truncate border-0 bg-transparent p-0 text-left text-content"
              on:click={pane.toggle}
              title={$t("editor.pdfPreview.collapse", { title: pane.title })}
            >
              <Icon icon={pane.icon} class="text-muted" />
              <span class="truncate text-sm font-medium">{pane.title}</span>
            </button>
            <div class="flex shrink-0 items-center gap-2">
              {#if pane.url}
                <Button
                  variant="outlined"
                  severity="secondary"
                  size="sm"
                  icon={faDownload}
                  href={pane.url}
                  download={`${pane.title}.pdf`}
                  title={$t("common.download")}
                >
                  {$t("common.download")}
                </Button>
              {/if}
              <Button
                variant="text"
                severity="secondary"
                size="sm"
                iconOnly
                icon={faChevronRight}
                ariaLabel={$t("editor.pdfPreview.collapse", { title: pane.title })}
                title={$t("editor.pdfPreview.collapse", { title: pane.title })}
                onClick={pane.toggle}
              />
            </div>
          </div>
          <div class="min-h-0 flex-1" role="group" aria-label={$t("editor.pdfPreview.frameTitle", { title: pane.title })}>
            {#if pane.url}
              <PdfEmbedViewer src={pane.url} />
            {:else}
              <div class="flex h-full items-center justify-center p-4 text-center text-sm text-muted">
                {placeholder}
              </div>
            {/if}
          </div>
        {:else}
          <button
            type="button"
            class="flex h-full w-full cursor-pointer flex-col items-center justify-center gap-2 border-0 bg-surface-raised py-3 text-content hover:bg-surface-inset"
            on:click={pane.toggle}
            title={$t("editor.pdfPreview.expand", { title: pane.title })}
          >
            <Icon icon={faChevronLeft} class="text-muted" />
            <Icon icon={pane.icon} />
            <span class="text-xs [writing-mode:vertical-rl]">{pane.title} PDF</span>
          </button>
        {/if}
      </div>
    {/each}
  </div>
{:else}
  <div
    class="flex w-full min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-line bg-surface-viewer"
    style="height: min(70dvh, {height}); min-height: 18rem;"
  >
    <Tabs
      class="shrink-0 bg-surface-raised"
      items={panes.map((p) => ({ id: p.id, label: p.title, icon: p.icon }))}
      value={mobilePane}
      onChange={(id) => selectMobilePane(id === "loesung" ? "loesung" : "angabe")}
    />

    <div class="min-h-0 flex-1" role="group" aria-label={$t("editor.pdfPreview.frameTitle", { title: activePane.title })}>
      {#if activePane.url}
        <PdfEmbedViewer src={activePane.url} />
      {:else}
        <div class="flex h-full items-center justify-center p-4 text-center text-sm text-muted">
          {placeholder}
        </div>
      {/if}
    </div>
  </div>
{/if}
