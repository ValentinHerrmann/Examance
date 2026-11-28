<script lang="ts" module>
  export type ZoomChoice = "actual" | "fit-width" | "fit-page";
</script>

<script lang="ts">
  // The zoom overlay of the PDF viewers (EmbedPDF and drawn pages): the zoom in percent, 100 %, fit width and fit page; shown for a moment after each zoom.
  import { onDestroy } from "svelte";
  import { t } from "#lib/i18n";

  interface Props {
    percent: number;
    onZoom: (choice: ZoomChoice) => void;
  }

  let { percent, onZoom }: Props = $props();

  let visible = $state(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let hovered = false;

  /** Shows the overlay; it hides itself 2.5 s later unless the pointer is on it. */
  export function show(): void {
    visible = true;
    if (timer) clearTimeout(timer);
    if (!hovered) timer = setTimeout(() => (visible = false), 2500);
  }

  export function hide(): void {
    if (timer) clearTimeout(timer);
    visible = false;
  }

  function choose(choice: ZoomChoice) {
    onZoom(choice);
    show();
  }

  onDestroy(() => {
    if (timer) clearTimeout(timer);
  });

  const buttonClass =
    "inline-flex cursor-pointer items-center justify-center rounded-sm border-none bg-transparent px-1.5 py-0.5 text-navbar-muted transition-colors hover:bg-navbar-hover hover:text-navbar-content pointer-coarse:min-h-11 pointer-coarse:min-w-11";
</script>

{#if visible}
  <div
    class="zoom-overlay absolute top-2.5 right-3 z-20 flex items-center gap-1.5 rounded-md border border-navbar-hover bg-navbar px-2 py-1 text-xs font-medium text-navbar-muted shadow-md"
    onmouseenter={() => {
      hovered = true;
      if (timer) clearTimeout(timer);
    }}
    onmouseleave={() => {
      hovered = false;
      show();
    }}
    role="toolbar"
    tabindex="-1"
    aria-label={$t("common.zoomControls")}
  >
    <span class="min-w-9 px-1 text-center font-semibold text-navbar-content">{percent}%</span>
    <span class="h-3 w-px bg-navbar-muted"></span>
    <button type="button" class="{buttonClass} text-xs font-medium" onclick={() => choose("actual")}>100%</button>
    <button type="button" class={buttonClass} onclick={() => choose("fit-width")} aria-label={$t("common.zoomFitWidth")} title={$t("common.zoomFitWidth")}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m18 8 4 4-4 4M6 8l-4 4 4 4M2 12h20" />
      </svg>
    </button>
    <button type="button" class={buttonClass} onclick={() => choose("fit-page")} aria-label={$t("common.zoomFitPage")} title={$t("common.zoomFitPage")}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m8 18 4 4 4-4M8 6l4-4 4 4M12 2v20" />
      </svg>
    </button>
  </div>
{/if}

<style>
  .zoom-overlay {
    animation: zoom-overlay-fade-in 0.15s ease-out;
  }

  /* Slide only, no fade: a half-transparent frame has too little contrast (axe catches it mid-animation). */
  @keyframes zoom-overlay-fade-in {
    from {
      transform: translateY(-2px);
    }
    to {
      transform: translateY(0);
    }
  }
</style>
