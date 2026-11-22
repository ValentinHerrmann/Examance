<script lang="ts">
  import { t } from "#lib/i18n";
  import { faCheck } from "@fortawesome/free-solid-svg-icons";
  import { Icon } from "#lib/components/ui";
  import type { StampDef } from "./toolbarLayout";

  /** A stamp's glyph over its short label, as on every toolbox button and in the drawers (issue #330). */
  let { stamp, label = true }: { stamp: StampDef; label?: boolean } = $props();
  const big = "text-base leading-none font-bold";
  const text: Partial<Record<StampDef["key"], string>> = { checkHalf: "½", checkQuarter: "¼", minusFull: "-1", minusHalf: "-½", minusQuarter: "-¼", wf: "WF", ff: "FF" };
</script>

{#if stamp.key === "checkFull"}
  <Icon icon={faCheck} class="text-success-fg" />
{:else if stamp.key === "checkHalf" || stamp.key === "checkQuarter"}
  <span class="flex items-center gap-0.5 text-warning-fg"><Icon icon={faCheck} /><span class="text-xs font-bold">{text[stamp.key]}</span></span>
{:else if stamp.group === "minus"}
  <span class="{big} text-danger-fg">{text[stamp.key]}</span>
{:else if stamp.key === "wrong"}
  <span class="{big} font-serif text-danger-fg italic">f</span>
{:else if stamp.key === "missing"}
  <span class="{big} text-warning-fg">∀</span>
{:else}
  <span class="{big} text-info-fg">{text[stamp.key]}</span>
{/if}
{#if label}<span class="text-xs font-semibold">{$t(`grading.toolbar.${stamp.key}`)}</span>{/if}
