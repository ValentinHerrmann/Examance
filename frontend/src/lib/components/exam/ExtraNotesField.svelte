<script lang="ts">
  import { untrack } from "svelte";
  import { Checkbox, Field, TextInput, Textarea, controlClass } from "#lib/components/ui";
  import { DEFAULT_EXTRA_NOTES, fillsLastPage, type ExtraNotes } from "#lib/db/schema";
  import { t } from "#lib/i18n";

  /** The writing space of the Layout tab's extra paper group (issues #156, #228): heading and note for every writing area, and the rest-of-page area with its min/max height. */
  interface Props {
    /** Null: never set; the defaults show and the area is off. */
    value: ExtraNotes | null;
    /** Fired on toggle and when a field is committed (change, not every keystroke). */
    onChange: (next: ExtraNotes) => void;
    idPrefix: string;
  }

  let { value, onChange, idPrefix }: Props = $props();

  const MIN_CM = 1;
  const MAX_CM = 25;

  // Local edit buffer; follows `value` whenever the owner stores a new one.
  let draft = $state<ExtraNotes>({ ...DEFAULT_EXTRA_NOTES, fill: false });

  function clamp(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(MAX_CM, Math.max(MIN_CM, n)) : MIN_CM;
  }

  /** Keeps both heights within 1..25 cm and min <= max; `changed` is the field the user just edited. */
  function commit(changed?: "min" | "max") {
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
    draft.fill = on;
    commit();
  }

  $effect.pre(() => {
    const next = value;
    untrack(() => {
      draft = next ? { ...next, fill: fillsLastPage(next) } : { ...DEFAULT_EXTRA_NOTES, fill: false };
    });
  });
</script>

<div class="flex flex-col gap-2">
  <Field label={$t("exam.extraNotes.title")} forId="{idPrefix}Title">
    <TextInput id="{idPrefix}Title" bind:value={draft.title} maxlength={200} onchange={() => commit()} />
  </Field>
  <Field label={$t("exam.extraNotes.description")} forId="{idPrefix}Description">
    <Textarea id="{idPrefix}Description" rows={2} bind:value={draft.description} maxlength={500} onchange={() => commit()} />
  </Field>
  <div class="flex flex-col gap-1">
    <Checkbox id="{idPrefix}Fill" checked={draft.fill !== false} onChange={toggle} label={$t("exam.extraNotes.fill")} />
    <p class="m-0 text-sm text-muted">{$t("exam.extraNotes.hint")}</p>
  </div>
  {#if draft.fill !== false}
    <div class="grid grid-cols-2 gap-3">
      <Field label={$t("exam.extraNotes.min")} forId="{idPrefix}Min">
        <input id="{idPrefix}Min" type="number" min={MIN_CM} max={MAX_CM} step="0.5" bind:value={draft.minHeightCm} onchange={() => commit("min")} class={controlClass} />
      </Field>
      <Field label={$t("exam.extraNotes.max")} forId="{idPrefix}Max">
        <input id="{idPrefix}Max" type="number" min={MIN_CM} max={MAX_CM} step="0.5" bind:value={draft.maxHeightCm} onchange={() => commit("max")} class={controlClass} />
      </Field>
    </div>
  {/if}
</div>
