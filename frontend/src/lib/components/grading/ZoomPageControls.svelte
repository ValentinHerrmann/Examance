<script lang="ts">
  import { gradingStore } from "#lib/grading/gradingStore";
  import { t } from "#lib/i18n";
  import {
    faExpand,
    faMagnifyingGlassMinus,
    faMagnifyingGlassPlus,
    faRotateLeft,
    faRotateRight,
  } from "@fortawesome/free-solid-svg-icons";
  import { Button } from "#lib/components/ui";
  import type { ControlsSide } from "#lib/stores/capabilities";

  /** The grading view's bottom bar: annotation history, the page in view, zoom (issue #330). Callbacks only forward intent; the viewer owns them. No page arrows: teachers scroll. */
  interface Props {
    onUndo: () => void;
    onRedo: () => void;
    onZoomOut: () => void;
    onZoomIn: () => void;
    onResetZoom: () => void;
    /** Corner of the canvas it floats in from `md` up (issue #328). */
    side?: ControlsSide;
  }

  let { onUndo, onRedo, onZoomOut, onZoomIn, onResetZoom, side = "left" }: Props = $props();

  // Icon-only text buttons: no frames, so the bar stays one short line on a tablet; touch keeps 44px targets.
  const btn = { size: "sm", variant: "text", severity: "secondary", iconOnly: true } as const;
</script>

<!-- Docked below the canvas on phones, floating in the controls' corner from `md` up. -->
<div
  class="z-30 flex shrink-0 items-center justify-center gap-0.5 rounded-md border border-line bg-surface-raised p-0.5 text-xs
    md:absolute md:bottom-3 md:shadow-md {side === 'right' ? 'md:right-3' : 'md:left-3'}"
>
  <Button {...btn} icon={faRotateLeft} disabled={!$gradingStore.canUndo} onClick={onUndo} title={$t("grading.toolbar.undoTitle")} ariaLabel={$t("grading.toolbar.undoTitle")} />
  <Button {...btn} icon={faRotateRight} disabled={!$gradingStore.canRedo} onClick={onRedo} title={$t("grading.toolbar.redoTitle")} ariaLabel={$t("grading.toolbar.redoTitle")} />
  {#if $gradingStore.isScanPdf && $gradingStore.totalPages > 1}
    <div class="mx-0.5 h-4 w-px shrink-0 bg-line"></div>
    <span class="px-1 whitespace-nowrap tabular-nums">{$t("grading.zoom.pageIndicator", { current: $gradingStore.currentPage, total: $gradingStore.totalPages })}</span>
  {/if}
  <div class="mx-0.5 h-4 w-px shrink-0 bg-line"></div>
  <Button {...btn} icon={faMagnifyingGlassMinus} onClick={onZoomOut} title={$t("grading.zoom.zoomOutTitle")} ariaLabel={$t("grading.zoom.zoomOutTitle")} />
  <span class="min-w-9 text-center font-mono font-bold whitespace-nowrap text-content tabular-nums">{$gradingStore.zoomScale === 1.0 ? $t("grading.zoom.fitLabel") : `${Math.round($gradingStore.zoomScale * 100)}%`}</span>
  <Button {...btn} icon={faMagnifyingGlassPlus} onClick={onZoomIn} title={$t("grading.zoom.zoomInTitle")} ariaLabel={$t("grading.zoom.zoomInTitle")} />
  <Button {...btn} icon={faExpand} onClick={onResetZoom} title={$t("grading.zoom.fitTitle")} ariaLabel={$t("grading.zoom.fitTitle")} />
</div>
