<script lang="ts">
  // One score row of the grading panel, for an exercise or one of its parts (issue #187): click to make it the stamp target (shown by the row's style alone), type a score (clamped to [0, max]), reset it; a flat list row slim enough for the 11rem panel (issue #328).
  import type { Snippet } from "svelte";
  import { t } from "#lib/i18n";
  import { faCommentDots, faTriangleExclamation, faXmark } from "@fortawesome/free-solid-svg-icons";
  import { Icon, controlClass, controlSmClass } from "#lib/components/ui";
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

  // Flat list row (the list draws the dividers); the stamp target gets an accent bar and highlight instead of a frame, so no width goes to borders or padding (issue #328).
  const base = "relative flex cursor-pointer items-center gap-1 py-1 pr-0.5 transition-colors pointer-coarse:min-h-10";
  let surface = $derived(nested ? "bg-surface-sunken" : "bg-surface-raised");
</script>

<div
  class="{base} {nested ? 'pl-5 text-xs' : 'pl-2'} {active ? 'bg-highlight' : `${surface} hover:bg-surface-inset`}"
  onclick={onSelect}
  role="button"
  tabindex="0"
  aria-pressed={active}
  title={active ? $t("grading.scoreEntry.stampTarget") : undefined}
  onkeydown={(e) => { if (e.key === "Enter" || e.key === " ") onSelect(); }}
>
  {#if active}<span class="absolute inset-y-0 left-0 w-1 bg-primary" aria-hidden="true"></span>{/if}
  <div class="flex min-w-0 flex-1 flex-wrap items-center gap-1 leading-tight">
    {@render label()}
    {#if manual}
      <span class="size-1.5 shrink-0 rounded-full bg-warning" title={$t("grading.scoreEntry.manualEdit")}></span>
    {/if}
    {#if warning}
      <Icon icon={faTriangleExclamation} class="text-xs text-warning-fg" label={warning} />
    {/if}
    {#if objected}
      <button
        type="button"
        class="inline-flex shrink-0 items-center gap-1 rounded-full bg-warning/20 px-1.5 py-0.5 text-xs font-semibold text-warning-fg lg:px-1 pointer-coarse:min-h-7"
        title={$t("review.thread.objection")}
        onclick={(e) => { e.stopPropagation(); reviewStore.patch({ dialog: "items" }); }}
      >
        <Icon icon={faCommentDots} /><span class="lg:sr-only">{$t("review.thread.objection")}</span>
      </button>
    {/if}
  </div>

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
    class="{controlClass} {controlSmClass} {nested ? 'w-12! lg:w-10!' : 'w-14! font-bold lg:w-11!'} shrink-0 px-1! text-right read-only:border-transparent read-only:bg-transparent read-only:shadow-none pointer-coarse:min-h-9 pointer-coarse:text-base"
  />
  <span class="w-7 shrink-0 text-xs whitespace-nowrap text-muted">/{maxLabel ?? max}</span>
  <!-- Narrow slot, hidden while there is nothing to reset, so the inputs stay aligned. -->
  <button
    type="button"
    class="flex size-6 shrink-0 items-center justify-center rounded text-xs text-muted hover:bg-surface-inset hover:text-content focus-visible:outline-2 focus-visible:outline-primary {value == null && !manual ? 'invisible' : ''}"
    title={$t("grading.scoreEntry.resetTitle")}
    aria-label={$t("grading.scoreEntry.resetTitle")}
    onclick={(e) => { e.stopPropagation(); onReset(); }}
  >
    <Icon icon={faXmark} />
  </button>
</div>
