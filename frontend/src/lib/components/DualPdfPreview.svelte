<script lang="ts">
  import { t } from "$lib/i18n";
  import { isDesktop } from "$lib/stores/viewport";
  import PdfEmbedViewer from "$lib/components/PdfEmbedViewer.svelte";
  import { faChevronLeft, faChevronRight, faDownload, faFileLines, faFilePdf } from "@fortawesome/free-solid-svg-icons";
  import { Button, Icon, Tabs } from "$lib/components/ui";

  // Titles/placeholder stay undefined by default so the catalog text follows the language switch.
  interface Props {
    previewPdfUrl?: string | null;
    previewSolutionPdfUrl?: string | null;
    showAngabePreview?: boolean;
    showLoesungPreview?: boolean;
    titleAngabe?: string | undefined;
    titleLoesung?: string | undefined;
    height?: string;
    placeholderText?: string | undefined;
  }

  let {
    previewPdfUrl = null,
    previewSolutionPdfUrl = null,
    showAngabePreview = $bindable(true),
    showLoesungPreview = $bindable(false),
    titleAngabe = undefined,
    titleLoesung = undefined,
    height = "100%",
    placeholderText = undefined
  }: Props = $props();

  let angabeTitle = $derived(titleAngabe ?? $t("editor.pdfPreview.titleAngabe"));
  let loesungTitle = $derived(titleLoesung ?? $t("editor.pdfPreview.titleLoesung"));
  let placeholder = $derived(placeholderText ?? $t("editor.pdfPreview.placeholder"));

  function handleToggleAngabe() {
    showAngabePreview = !showAngabePreview;
  }

  function handleToggleLoesung() {
    showLoesungPreview = !showLoesungPreview;
  }

  // Below `lg` the split becomes a segmented switch over a single pane; height is capped to the viewport.
  type PaneId = "angabe" | "loesung";
  let mobilePane: PaneId = $state("angabe");

  let panes = $derived([
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
  ]);

  let activePane = $derived(panes.find((p) => p.id === mobilePane) ?? panes[0]);

  // Keep the desktop visibility flags in step with the mobile switch.
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
              onclick={pane.toggle}
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
            onclick={pane.toggle}
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
