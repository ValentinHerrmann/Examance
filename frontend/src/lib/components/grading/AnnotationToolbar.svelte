<script lang="ts">
  import { gradingStore, type ToolType } from "#lib/grading/gradingStore";
  import { t } from "#lib/i18n";
  import { faCheck, faEraser, faPen, faRulerHorizontal, faTrashCan } from "@fortawesome/free-solid-svg-icons";
  import { Button, Icon } from "#lib/components/ui";

  interface Props {
    /** Clearing is gated by a parent-owned confirm dialog; this component only requests it, never mutates the store. */
    onClearRequested: () => void;
  }

  let { onClearRequested }: Props = $props();

  /* Finger-sized (48px) glyph-over-label tool button. `!` beats the Button
   * size recipe's own padding/gap. */
  const toolBtn = "h-12 min-h-12 w-12 shrink-0 flex-col gap-0! px-1! py-1!";

  function selectTool(tool: ToolType) {
    gradingStore.setDrawTool(tool);
  }
</script>

<!-- Below `lg` docked as a strip above the canvas (floating covered the scan on phones); overlay from `lg` up. -->
<div
  class="scroll-pane z-30 flex shrink-0 flex-row gap-1 overflow-x-auto rounded-md border border-line bg-surface-raised p-1.5
    lg:absolute lg:top-3 lg:left-3 lg:max-h-[calc(100%-3rem)] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto lg:p-1 lg:shadow-md"
>
  <Button
    size="sm"
    variant="text"
    severity="secondary"
    class={toolBtn}
    pressed={$gradingStore.drawTool === "pen"}
    onClick={() => selectTool("pen")}
    title={$t("grading.toolbar.penTitle")}
  >
    <Icon icon={faPen} />
    <span class="text-xs font-semibold">{$t("grading.toolbar.pen")}</span>
  </Button>
  <Button
    size="sm"
    variant="text"
    severity="secondary"
    class={toolBtn}
    pressed={$gradingStore.drawTool === "line"}
    onClick={() => selectTool("line")}
    title={$t("grading.toolbar.lineTitle")}
  >
    <Icon icon={faRulerHorizontal} />
    <span class="text-xs font-semibold">{$t("grading.toolbar.line")}</span>
  </Button>
  <Button
    size="sm"
    variant="text"
    severity="secondary"
    class={toolBtn}
    pressed={$gradingStore.drawTool === "eraser"}
    onClick={() => selectTool("eraser")}
    title={$t("grading.toolbar.eraserTitle")}
  >
    <Icon icon={faEraser} />
    <span class="text-xs font-semibold">{$t("grading.toolbar.eraser")}</span>
  </Button>
  <div class="h-8 w-px shrink-0 self-center bg-line lg:h-px lg:w-8"></div>
  <Button
    size="sm"
    variant="text"
    severity="secondary"
    class={toolBtn}
    pressed={$gradingStore.drawTool === "check_full" || $gradingStore.drawTool === "check"}
    onClick={() => selectTool("check_full")}
    title={$t("grading.toolbar.checkFullTitle")}
  >
    <Icon icon={faCheck} class="text-success-fg" />
    <span class="text-xs font-semibold">{$t("grading.toolbar.checkFull")}</span>
  </Button>
  <Button
    size="sm"
    variant="text"
    severity="secondary"
    class={toolBtn}
    pressed={$gradingStore.drawTool === "check_half"}
    onClick={() => selectTool("check_half")}
    title={$t("grading.toolbar.checkHalfTitle")}
  >
    <span class="flex items-center gap-0.5 text-warning-fg"><Icon icon={faCheck} /><span class="text-xs font-bold">½</span></span>
    <span class="text-xs font-semibold">{$t("grading.toolbar.checkHalf")}</span>
  </Button>
  <Button
    size="sm"
    variant="text"
    severity="secondary"
    class={toolBtn}
    pressed={$gradingStore.drawTool === "check_quarter"}
    onClick={() => selectTool("check_quarter")}
    title={$t("grading.toolbar.checkQuarterTitle")}
  >
    <span class="flex items-center gap-0.5 text-warning-fg"><Icon icon={faCheck} /><span class="text-xs font-bold">¼</span></span>
    <span class="text-xs font-semibold">{$t("grading.toolbar.checkQuarter")}</span>
  </Button>
  <div class="h-8 w-px shrink-0 self-center bg-line lg:h-px lg:w-8"></div>
  <Button
    size="sm"
    variant="text"
    severity="secondary"
    class={toolBtn}
    pressed={$gradingStore.drawTool === "minus_full"}
    onClick={() => selectTool("minus_full")}
    title={$t("grading.toolbar.minusFullTitle")}
  >
    <span class="text-base leading-none font-bold text-danger-fg">-1</span>
    <span class="text-xs font-semibold">{$t("grading.toolbar.minusFull")}</span>
  </Button>
  <Button
    size="sm"
    variant="text"
    severity="secondary"
    class={toolBtn}
    pressed={$gradingStore.drawTool === "minus_half"}
    onClick={() => selectTool("minus_half")}
    title={$t("grading.toolbar.minusHalfTitle")}
  >
    <span class="text-base leading-none font-bold text-danger-fg">-½</span>
    <span class="text-xs font-semibold">{$t("grading.toolbar.minusHalf")}</span>
  </Button>
  <Button
    size="sm"
    variant="text"
    severity="secondary"
    class={toolBtn}
    pressed={$gradingStore.drawTool === "minus_quarter"}
    onClick={() => selectTool("minus_quarter")}
    title={$t("grading.toolbar.minusQuarterTitle")}
  >
    <span class="text-base leading-none font-bold text-danger-fg">-¼</span>
    <span class="text-xs font-semibold">{$t("grading.toolbar.minusQuarter")}</span>
  </Button>
  <div class="h-8 w-px shrink-0 self-center bg-line lg:h-px lg:w-8"></div>
  <Button
    size="sm"
    variant="text"
    severity="secondary"
    class={toolBtn}
    pressed={$gradingStore.drawTool === "wrong" || $gradingStore.drawTool === "cross"}
    onClick={() => selectTool("wrong")}
    title={$t("grading.toolbar.wrongTitle")}
  >
    <span class="font-serif text-base leading-none font-bold text-danger-fg italic">f</span>
    <span class="text-xs font-semibold">{$t("grading.toolbar.wrong")}</span>
  </Button>
  <Button
    size="sm"
    variant="text"
    severity="secondary"
    class={toolBtn}
    pressed={$gradingStore.drawTool === "missing"}
    onClick={() => selectTool("missing")}
    title={$t("grading.toolbar.missingTitle")}
  >
    <span class="text-base leading-none font-bold text-warning-fg">∀</span>
    <span class="text-xs font-semibold">{$t("grading.toolbar.missing")}</span>
  </Button>
  <Button
    size="sm"
    variant="text"
    severity="secondary"
    class={toolBtn}
    pressed={$gradingStore.drawTool === "wf"}
    onClick={() => selectTool("wf")}
    title={$t("grading.toolbar.wfTitle")}
  >
    <span class="text-base leading-none font-bold text-info-fg">WF</span>
    <span class="text-xs font-semibold">{$t("grading.toolbar.wf")}</span>
  </Button>
  <Button
    size="sm"
    variant="text"
    severity="secondary"
    class={toolBtn}
    pressed={$gradingStore.drawTool === "ff"}
    onClick={() => selectTool("ff")}
    title={$t("grading.toolbar.ffTitle")}
  >
    <span class="text-base leading-none font-bold text-info-fg">FF</span>
    <span class="text-xs font-semibold">{$t("grading.toolbar.ff")}</span>
  </Button>
  <div class="h-8 w-px shrink-0 self-center bg-line lg:h-px lg:w-8"></div>
  <Button
    size="sm"
    variant="text"
    severity="danger"
    class={toolBtn}
    onClick={onClearRequested}
    title={$t("grading.toolbar.clearTitle")}
  >
    <Icon icon={faTrashCan} />
    <span class="text-xs font-semibold">{$t("grading.toolbar.clear")}</span>
  </Button>
</div>
