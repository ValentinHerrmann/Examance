<script lang="ts">
  import { gradingStore, type ToolType } from "#lib/grading/gradingStore";
  import { t } from "#lib/i18n";
  import { faCrosshairs, faEraser, faPen, faRulerHorizontal, faTrashCan } from "@fortawesome/free-solid-svg-icons";
  import { Button, Icon } from "#lib/components/ui";
  import { minWidth } from "#lib/stores/viewport";
  import type { ControlsSide } from "#lib/stores/capabilities";
  import StampGlyph from "./StampGlyph.svelte";
  import StampDrawer from "./StampDrawer.svelte";
  import { toolbarSections, toolbarStep, type StampDef } from "./toolbarLayout";

  interface Props {
    /** The viewer owns the strokes; this component only asks, never mutates them. */
    onClear: () => void;
    /** Side of the canvas it sits on from `md` up (issue #328); drawers open away from it. */
    side?: ControlsSide;
  }

  let { onClear, side = "left" }: Props = $props();

  /* Finger-sized (48px) glyph-over-label tool button. `!` beats the Button size recipe's own padding/gap. */
  const toolBtn = "h-12 min-h-12 w-12 shrink-0 flex-col gap-0! px-1! py-1!";
  const separator = "h-8 w-px shrink-0 self-center bg-line md:h-px md:w-8";

  // Vertical from `md` (a column in the side rail), a strip above the scan on phones; either way it folds stamps into drawers instead of scrolling (issue #330).
  const vertical = minWidth("md");
  let room = $state({ w: 0, h: 0 });
  let step = $derived(toolbarStep($vertical ? room.h : room.w));
  let sections = $derived(toolbarSections(step));
  // Drawers open away from the rail's edge, or below the strip.
  const sidePlacement = { left: "right-start", right: "left-start" } as const;
  let placement: "right-start" | "left-start" | "bottom-start" = $derived($vertical ? sidePlacement[side] : "bottom-start");

  function selectTool(tool: ToolType) {
    gradingStore.setDrawTool(tool);
  }

  function isSelected(stamp: StampDef): boolean {
    const tool = $gradingStore.drawTool;
    return tool === stamp.tool || !!stamp.aliases?.includes(tool);
  }

  function observe(node: HTMLElement) {
    const measure = () => (room = { w: node.clientWidth, h: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }
</script>

<!-- The wrapper takes the room the toolbox may use (the rail's height from `md`, the canvas width below); the bar inside keeps its own size. -->
<div class="flex min-h-0 min-w-0 shrink-0 md:h-full" use:observe>
  <div
    class="z-30 flex shrink-0 flex-row gap-1 self-start rounded-md border border-line bg-surface-raised p-1 md:flex-col md:shadow-md"
    data-toolbar-step={step}
  >
    <Button size="sm" variant="text" severity="secondary" class={toolBtn} pressed={$gradingStore.drawTool === "pen"} onClick={() => selectTool("pen")} title={$t("grading.toolbar.penTitle")}>
      <Icon icon={faPen} />
      <span class="text-xs font-semibold">{$t("grading.toolbar.pen")}</span>
    </Button>
    <Button size="sm" variant="text" severity="secondary" class={toolBtn} pressed={$gradingStore.drawTool === "line"} onClick={() => selectTool("line")} title={$t("grading.toolbar.lineTitle")}>
      <Icon icon={faRulerHorizontal} />
      <span class="text-xs font-semibold">{$t("grading.toolbar.line")}</span>
    </Button>
    <Button size="sm" variant="text" severity="secondary" class={toolBtn} pressed={$gradingStore.drawTool === "eraser"} onClick={() => selectTool("eraser")} title={$t("grading.toolbar.eraserTitle")}>
      <Icon icon={faEraser} />
      <span class="text-xs font-semibold">{$t("grading.toolbar.eraser")}</span>
    </Button>
    <!-- Dims the scan outside the selected exercise (issue #235); on again with every student. -->
    <Button size="sm" variant="text" severity="secondary" class={toolBtn} pressed={$gradingStore.focusDimming} onClick={() => gradingStore.setFocusDimming(!$gradingStore.focusDimming)} title={$t("grading.toolbar.focusTitle")}>
      <Icon icon={faCrosshairs} />
      <span class="text-xs font-semibold">{$t("grading.toolbar.focus")}</span>
    </Button>
    <div class={separator}></div>
    {#each sections as section, i (i)}
      {#if section.kind === "drawer"}
        <StampDrawer id={section.id} stamps={section.stamps} {placement} buttonClass={toolBtn} {isSelected} onPick={selectTool} />
      {:else}
        {#if i > 0}<div class={separator}></div>{/if}
        {#each section.stamps as stamp (stamp.tool)}
          <Button size="sm" variant="text" severity="secondary" class={toolBtn} pressed={isSelected(stamp)} onClick={() => selectTool(stamp.tool)} title={$t(`grading.toolbar.${stamp.key}Title`)}>
            <StampGlyph {stamp} />
          </Button>
        {/each}
      {/if}
    {/each}
    <div class={separator}></div>
    <Button size="sm" variant="text" severity="danger" class={toolBtn} onClick={onClear} title={$t("grading.toolbar.clearTitle")}>
      <Icon icon={faTrashCan} />
      <span class="text-xs font-semibold">{$t("grading.toolbar.clear")}</span>
    </Button>
  </div>
</div>
