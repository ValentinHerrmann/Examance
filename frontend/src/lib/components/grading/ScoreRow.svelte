<script lang="ts">
  // One score row of the grading panel, for an exercise or one of its parts (issue #187): click to make it the stamp target, type a score (clamped to [0, max]), reset it.
  import type { Snippet } from "svelte";
  import { t } from "#lib/i18n";
  import { faBullseye, faTriangleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";
  import { Button, Icon, controlClass, controlSmClass } from "#lib/components/ui";

  interface Props {
    label: Snippet;
    value: number | null | undefined;
    max: number;
    /** Shown after the slash; defaults to `max`. */
    maxLabel?: number;
    active: boolean;
    manual: boolean;
    /** A part row: indented and smaller. */
    nested?: boolean;
    /** Not typed (the score follows from the parts); the reason is its tooltip. */
    readonlyReason?: string;
    warning?: string;
    inputId?: string;
    ariaLabel?: string;
    onSelect: () => void;
    onValue: (value: number | null) => void;
    onReset: () => void;
  }

  let { label, value, max, maxLabel, active, manual, nested = false, readonlyReason, warning, inputId, ariaLabel, onSelect, onValue, onReset }: Props = $props();

  function handleInput(e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value.trim();
    const parsed = parseFloat(raw);
    onValue(raw === "" || isNaN(parsed) ? null : Math.max(0, Math.min(max, parsed)));
  }

  const base = "flex cursor-pointer items-center justify-between gap-2 rounded-md border transition-colors pointer-coarse:min-h-11";
</script>

<div
  class="{base} {nested ? 'ml-4 px-2 py-1 text-xs' : 'px-2 py-1.5'} {active
    ? 'border-primary bg-highlight shadow-sm'
    : 'border-line bg-surface-raised hover:border-line-strong hover:bg-surface-inset'}"
  onclick={onSelect}
  role="button"
  tabindex="0"
  onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(); }}
>
  <div class="flex min-w-0 items-center gap-1">
    {@render label()}
    {#if active}
      <Icon icon={faBullseye} class="text-xs text-accent" label={$t("grading.scoreEntry.stampTarget")} />
    {/if}
    {#if warning}
      <Icon icon={faTriangleExclamation} class="text-xs text-warning-fg" label={warning} />
    {/if}
  </div>

  <div class="flex items-center gap-1">
    <input
      id={inputId}
      type="number"
      step="0.25"
      min="0"
      {max}
      placeholder="–"
      aria-label={ariaLabel}
      value={value ?? ""}
      readonly={!!readonlyReason}
      title={readonlyReason}
      onclick={(e) => e.stopPropagation()}
      oninput={handleInput}
      class="{controlClass} {controlSmClass} {nested ? 'w-14' : 'w-16 font-bold'} text-right pointer-coarse:min-h-11 pointer-coarse:text-base"
    />
    <span class="text-xs text-muted">/ {maxLabel ?? max}</span>
    <Button
      size="sm"
      variant="text"
      severity="secondary"
      iconOnly
      icon={faXmark}
      title={$t("grading.scoreEntry.resetTitle")}
      ariaLabel={$t("grading.scoreEntry.resetTitle")}
      onClick={(e) => { e.stopPropagation(); onReset(); }}
    />
  </div>

  {#if manual}
    <span class="size-2 shrink-0 rounded-full bg-warning" title={$t("grading.scoreEntry.manualEdit")}></span>
  {/if}
</div>
