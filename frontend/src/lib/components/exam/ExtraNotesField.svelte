<script lang="ts">
  import { untrack } from "svelte";
  import { Checkbox, Field, TextInput, controlClass } from "#lib/components/ui";
  import { DEFAULT_EXTRA_NOTES, type ExtraNotes } from "#lib/db/schema";
  import { t } from "#lib/i18n";

  /** Toggle for the karo block closing the exam (issue #156), below both exercise lists. */
  interface Props {
    value: ExtraNotes | null;
    /** Fired on toggle and when a field is committed (change, not every keystroke). */
    onChange: (next: ExtraNotes | null) => void;
    idPrefix: string;
  }

  let { value, onChange, idPrefix }: Props = $props();

  const MIN_CM = 1;
  const MAX_CM = 25;

  // Local edit buffer; follows `value` whenever the owner stores a new one.
  let draft = $state<ExtraNotes | null>(null);

  function clamp(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(MAX_CM, Math.max(MIN_CM, n)) : MIN_CM;
  }

  /** Keeps both heights within 1..25 cm and min <= max; `changed` is the field the user just edited. */
  function commit(changed?: "min" | "max") {
    if (!draft) return;
    let min = clamp(draft.minHeightCm);
    let max = clamp(draft.maxHeightCm);
    if (min > max) {
      if (changed === "max") min = max;
      else max = min;
    }
    draft.minHeightCm = min;
    draft.maxHeightCm = max;
    onChange($state.snapshot(draft));
  }

  function toggle(on: boolean) {
    draft = on ? { ...DEFAULT_EXTRA_NOTES } : null;
    onChange(draft ? $state.snapshot(draft) : null);
  }

  $effect.pre(() => {
    const next = value;
    untrack(() => {
      draft = next ? { ...next } : null;
    });
  });
</script>

<div class="flex flex-col gap-2">
  <div class="flex flex-col gap-1">
    <Checkbox id="{idPrefix}Enabled" checked={draft !== null} onChange={toggle} label={$t("exam.extraNotes.label")} />
    <p class="m-0 text-sm text-muted">{$t("exam.extraNotes.hint")}</p>
  </div>
  {#if draft}
    <Field label={$t("exam.extraNotes.title")} forId="{idPrefix}Title">
      <TextInput id="{idPrefix}Title" bind:value={draft.title} maxlength={300} onchange={() => commit()} />
    </Field>
    <div class="grid grid-cols-2 gap-3">
      <Field label={$t("exam.extraNotes.min")} forId="{idPrefix}Min">
        <input
          id="{idPrefix}Min"
          type="number"
          min={MIN_CM}
          max={MAX_CM}
          step="0.5"
          bind:value={draft.minHeightCm}
          onchange={() => commit("min")}
          class={controlClass}
        />
      </Field>
      <Field label={$t("exam.extraNotes.max")} forId="{idPrefix}Max">
        <input
          id="{idPrefix}Max"
          type="number"
          min={MIN_CM}
          max={MAX_CM}
          step="0.5"
          bind:value={draft.maxHeightCm}
          onchange={() => commit("max")}
          class={controlClass}
        />
      </Field>
    </div>
  {/if}
</div>
