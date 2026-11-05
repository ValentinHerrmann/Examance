<script lang="ts">
  import { untrack, type Snippet } from "svelte";
  import { t } from "#lib/i18n";
  import { isDesktop } from "#lib/stores/viewport";
  import PdfEmbedViewer from "#lib/components/PdfEmbedViewer.svelte";
  import { faChevronLeft, faChevronRight, faDownload, faFileLines, faFilePdf } from "@fortawesome/free-solid-svg-icons";
  import { Button, Icon, Tabs } from "#lib/components/ui";

  // Titles/placeholder stay undefined by default so the catalog text follows the language switch.
  interface Props {
    previewPdfUrl?: string | null;
    previewSolutionPdfUrl?: string | null;
    showAngabePreview?: boolean;
    showLoesungPreview?: boolean;
    titleAngabe?: string | undefined;
    titleLoesung?: string | undefined;
    /** Inside a flex column the root's (and below lg the pane's) flex-1 overrides this, so give that parent a fixed height; a content-sized one shrinks the PDF to its minimum (issue #210). */
    height?: string;
    placeholderText?: string | undefined;
    /** Desktop: with every pane collapsed, shrink to the collapsed strips and give the rest of the row back. */
    shrinkWhenCollapsed?: boolean;
    /** Icon action in every open pane's header (and once beside the phone tabs): the LaTeX error report. Kept out of a row under the PDFs to save height. */
    report?: Snippet;
    /** False hides the download buttons (a student's view-only result page, issue #207). */
    downloadable?: boolean;
    /** More PDFs beside task sheet and solution (the Print step's sticker sheet). Collapsed until their URL first appears or changes; then they open. */
    extraPanes?: { id: string; title: string; url: string | null }[];
  }

  let {
    previewPdfUrl = null,
    previewSolutionPdfUrl = null,
    showAngabePreview = $bindable(true),
    showLoesungPreview = $bindable(false),
    titleAngabe = undefined,
    titleLoesung = undefined,
    height = "100%",
    placeholderText = undefined,
    shrinkWhenCollapsed = false,
    report,
    downloadable = true,
    extraPanes = [],
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
  type PaneId = string;
  let mobilePane: PaneId = $state("angabe");
  let extraOpen = $state<Record<string, boolean>>({});
  let extraSeenUrl: Record<string, string | null> = {};

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
    ...extraPanes.map((x) => ({
      id: x.id,
      title: x.title,
      icon: faFilePdf,
      url: x.url,
      shown: !!extraOpen[x.id],
      toggle: () => (extraOpen = { ...extraOpen, [x.id]: !extraOpen[x.id] }),
    })),
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
    if (id !== "angabe" && id !== "loesung" && !extraOpen[id]) extraOpen = { ...extraOpen, [id]: true };
  }

  let allCollapsed = $derived(panes.every((p) => !p.shown));

  // A new or changed extra PDF opens its pane (and selects it on phones), so what was just made is in view.
  $effect.pre(() => {
    const urls = extraPanes.map((x) => [x.id, x.url] as const);
    untrack(() => {
      for (const [id, url] of urls) {
        if (url && url !== extraSeenUrl[id]) {
          extraOpen = { ...extraOpen, [id]: true };
          mobilePane = id;
        }
        extraSeenUrl[id] = url;
      }
    });
  });

  const paneShell =
    "flex flex-col overflow-hidden rounded-md border border-line bg-surface-viewer transition-all duration-200";
</script>

{#if $isDesktop}
  <div
    class="flex min-w-0 flex-col gap-1.5 {shrinkWhenCollapsed && allCollapsed ? 'flex-none' : 'w-full flex-1'}"
    style="height: {height};"
  >
    <div class="flex min-h-0 min-w-0 flex-1 gap-2 overflow-hidden">
      {#each panes as pane (pane.id)}
        <div class="{paneShell} {pane.shown ? 'min-w-0 flex-1' : 'w-10 shrink-0'}">
          {#if pane.shown}
            <div class="flex w-full items-center justify-between gap-2 border-b border-line bg-surface-sunken px-2 py-0.5 text-content">
              <button
                type="button"
                class="flex min-w-0 flex-1 cursor-pointer items-center gap-2 truncate border-0 bg-transparent p-0 text-left text-content"
                onclick={pane.toggle}
                title={$t("editor.pdfPreview.collapse", { title: pane.title })}
              >
                <Icon icon={pane.icon} class="text-xs text-muted" />
                <span class="truncate text-xs font-medium text-muted">{pane.title}</span>
              </button>
              <div class="flex shrink-0 items-center gap-0.5">
                {@render report?.()}
                {#if pane.url && downloadable}
                  <Button
                    variant="text"
                    severity="secondary"
                    size="sm"
                    iconOnly
                    icon={faDownload}
                    href={pane.url}
                    download={`${pane.title}.pdf`}
                    ariaLabel={$t("common.download")}
                    title={$t("common.download")}
                  />
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
                <div class="flex h-full items-center justify-center p-4 text-center text-sm text-content">
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
  </div>
{:else}
  <div class="flex w-full min-w-0 flex-1 flex-col gap-1.5">
    <div
      class="flex w-full min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-line bg-surface-viewer"
      style="height: min(70dvh, {height}); min-height: 18rem;"
    >
      <div class="flex shrink-0 items-center bg-surface-raised">
        <Tabs
          class="min-w-0 flex-1"
          items={panes.map((p) => ({ id: p.id, label: p.title, icon: p.icon }))}
          value={mobilePane}
          onChange={(id) => selectMobilePane(id)}
        />
        {#if report}<div class="shrink-0 px-1">{@render report()}</div>{/if}
      </div>

      <div class="min-h-0 flex-1" role="group" aria-label={$t("editor.pdfPreview.frameTitle", { title: activePane.title })}>
        {#if activePane.url}
          <PdfEmbedViewer src={activePane.url} />
        {:else}
          <div class="flex h-full items-center justify-center p-4 text-center text-sm text-content">
            {placeholder}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}
