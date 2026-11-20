<script lang="ts">
  // One score row of the grading panel, for an exercise or one of its parts (issue #187): click to make it the stamp target (shown by the row's style alone), type a score (clamped to [0, max]), reset it; slim from `lg` to fit the 11rem panel (issue #328).
  import type { Snippet } from "svelte";
  import { t } from "#lib/i18n";
  import { faCommentDots, faTriangleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";
  import { Button, Icon, controlClass, controlSmClass } from "#lib/components/ui";
  import { reviewStore } from "#lib/grading/reviewStore";

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
    /** Item key of this row in a grading review (issue #226): an objection shows as a badge that opens the review dialog. */
    reviewKey?: string;
    ariaLabel?: string;
    onSelect: () => void;
    onValue: (value: number | null) => void;
    onReset: () => void;
  }

  let { label, value, max, maxLabel, active, manual, nested = false, readonlyReason, warning, inputId, reviewKey, ariaLabel, onSelect, onValue, onReset }: Props = $props();

  function handleInput(e: Event) {
    const raw = (e.currentTarget as HTMLInputElement).value.trim();
    const parsed = parseFloat(raw);
    onValue(raw === "" || isNaN(parsed) ? null : Math.max(0, Math.min(max, parsed)));
  }

  let objected = $derived(Boolean(reviewKey && $reviewStore.thread?.objections[reviewKey]?.trim()));

  const base = "flex cursor-pointer items-center justify-between gap-2 lg:gap-1 rounded-md border transition-colors pointer-coarse:min-h-11";
</script>

<div
  class="{base} {nested ? 'ml-4 py-1 text-xs lg:ml-2' : 'py-1.5'} {active
    ? 'border-primary border-l-4 bg-highlight pr-2 pl-1.5 shadow-sm lg:pr-1.5 lg:pl-1'
    : 'border-line bg-surface-raised px-2 hover:border-line-strong hover:bg-surface-inset lg:px-1.5'}"
  onclick={onSelect}
  role="button"
  tabindex="0"
  aria-pressed={active}
  title={active ? $t("grading.scoreEntry.stampTarget") : undefined}
  onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(); }}
>
  <div class="flex min-w-0 flex-wrap items-center gap-1">
    {@render label()}
    {#if warning}
      <Icon icon={faTriangleExclamation} class="text-xs text-warning-fg" label={warning} />
    {/if}
    {#if objected}
      <button
        type="button"
        class="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/20 px-1.5 py-0.5 text-xs lg:px-1 font-semibold text-warning-fg pointer-coarse:min-h-8"
        title={$t("review.thread.objection")}
        onclick={(e) => { e.stopPropagation(); reviewStore.patch({ dialog: "items" }); }}
      >
        <Icon icon={faCommentDots} /><span class="lg:sr-only">{$t("review.thread.objection")}</span>
      </button>
    {/if}
  </div>

  <div class="flex shrink-0 items-center gap-1 lg:gap-0.5">
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
      class="{controlClass} {controlSmClass} {nested ? 'w-14 lg:w-10' : 'w-16 font-bold lg:w-11'} text-right pointer-coarse:min-h-11 pointer-coarse:text-base"
    />
    <span class="text-xs whitespace-nowrap text-muted">/ {maxLabel ?? max}</span>
    <Button
      size="sm"
      variant="text"
      severity="secondary"
      iconOnly
      icon={faXmark}
      class="lg:px-1!"
      title={$t("grading.scoreEntry.resetTitle")}
      ariaLabel={$t("grading.scoreEntry.resetTitle")}
      onClick={(e) => { e.stopPropagation(); onReset(); }}
    />
  </div>

  {#if manual}
    <span class="size-2 shrink-0 rounded-full bg-warning" title={$t("grading.scoreEntry.manualEdit")}></span>
  {/if}
</div>
