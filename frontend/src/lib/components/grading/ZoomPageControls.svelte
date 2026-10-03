<script lang="ts">
  import { gradingStore } from "$lib/grading/gradingStore";
  import { t } from "$lib/i18n";
  import {
    faChevronLeft,
    faChevronRight,
    faCrop,
    faMagnifyingGlassMinus,
    faMagnifyingGlassPlus,
  } from "@fortawesome/free-solid-svg-icons";
  import { Button } from "$lib/components/ui";

  interface Props {
    onPagePrev: () => void;
    onPageNext: () => void;
    onToggleAutoCrop: () => void;
    onZoomOut: () => void;
    onZoomIn: () => void;
    onResetZoom: () => void;
  }

  let {
    onPagePrev,
    onPageNext,
    onToggleAutoCrop,
    onZoomOut,
    onZoomIn,
    onResetZoom
  }: Props = $props();

</script>

<!-- Docked below the canvas on small screens, floating over it from `lg` up (as the annotation toolbar). -->
<div
  class="scroll-pane z-30 flex shrink-0 items-center justify-center gap-1.5 overflow-x-auto rounded-md border border-line bg-surface-raised px-2 py-1.5 text-xs
    lg:absolute lg:right-3 lg:bottom-3 lg:justify-end lg:overflow-visible lg:shadow-md"
>
  {#if $gradingStore.isScanPdf && $gradingStore.totalPages > 1}
    <Button
      size="sm"
      variant="outlined"
      severity="secondary"
      iconOnly
      icon={faChevronLeft}
      onClick={onPagePrev}
      disabled={$gradingStore.currentPage <= 1}
      title={$t("grading.zoom.pagePrevTitle")}
      ariaLabel={$t("grading.zoom.pagePrevTitle")}
    />
    <span class="whitespace-nowrap">{$t("grading.zoom.pageIndicator", { current: $gradingStore.currentPage, total: $gradingStore.totalPages })}</span>
    <Button
      size="sm"
      variant="outlined"
      severity="secondary"
      iconOnly
      icon={faChevronRight}
      onClick={onPageNext}
      disabled={$gradingStore.currentPage >= $gradingStore.totalPages}
      title={$t("grading.zoom.pageNextTitle")}
      ariaLabel={$t("grading.zoom.pageNextTitle")}
    />
    <div class="mx-0.5 h-4 w-px shrink-0 bg-line"></div>
  {/if}
  <Button
    size="sm"
    variant="outlined"
    severity="secondary"
    icon={faCrop}
    pressed={$gradingStore.isAutoCropEnabled}
    onClick={onToggleAutoCrop}
    title={$gradingStore.isAutoCropEnabled ? $t("grading.zoom.autoCropOnTitle") : $t("grading.zoom.autoCropOffTitle")}
  >
    {$gradingStore.isAutoCropEnabled ? $t("grading.zoom.autoCropOn") : $t("grading.zoom.autoCropOff")}
  </Button>
  <div class="mx-0.5 h-4 w-px shrink-0 bg-line"></div>
  <Button
    size="sm"
    variant="outlined"
    severity="secondary"
    iconOnly
    icon={faMagnifyingGlassMinus}
    onClick={onZoomOut}
    title={$t("grading.zoom.zoomOutTitle")}
    ariaLabel={$t("grading.zoom.zoomOutTitle")}
  />
  <span class="px-1 font-mono font-bold whitespace-nowrap text-content">{$gradingStore.zoomScale === 1.0 ? $t("grading.zoom.fitLabel") : `${Math.round($gradingStore.zoomScale * 100)}%`}</span>
  <Button
    size="sm"
    variant="outlined"
    severity="secondary"
    iconOnly
    icon={faMagnifyingGlassPlus}
    onClick={onZoomIn}
    title={$t("grading.zoom.zoomInTitle")}
    ariaLabel={$t("grading.zoom.zoomInTitle")}
  />
  <Button
    size="sm"
    variant="outlined"
    severity="secondary"
    onClick={onResetZoom}
    title={$t("grading.zoom.fitTitle")}
  >{$t("grading.zoom.fitLabel")}</Button>
</div>
