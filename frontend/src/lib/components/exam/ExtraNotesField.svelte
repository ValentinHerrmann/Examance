<script lang="ts">
  import { Checkbox, Field, TextInput, controlClass } from "#lib/components/ui";
  import { DEFAULT_EXTRA_NOTES, type ExtraNotes } from "#lib/db/schema";

  /** Shared by the create form and the metadata editor: switch for the closing karo block (issue #156). */
  interface Props {
    value: ExtraNotes | null;
    idPrefix: string;
    label: string;
    hint: string;
    titleLabel: string;
    minLabel: string;
    maxLabel: string;
  }

  let { value = $bindable(null), idPrefix, label, hint, titleLabel, minLabel, maxLabel }: Props = $props();

  const MIN_CM = 1;
  const MAX_CM = 25;

  function clamp(v: unknown): number {
    const n = Number(v);
    return Number.isFinite(n) ? Math.min(MAX_CM, Math.max(MIN_CM, n)) : MIN_CM;
  }

  /** Keeps both heights within 1..25 cm and min <= max; `changed` is the field the user just edited. */
  function normalize(changed: "min" | "max") {
    if (!value) return;
    let min = clamp(value.minHeightCm);
    let max = clamp(value.maxHeightCm);
    if (min > max) {
      if (changed === "min") max = min;
      else min = max;
    }
    value.minHeightCm = min;
    value.maxHeightCm = max;
  }

  function toggle(on: boolean) {
    value = on ? { ...DEFAULT_EXTRA_NOTES } : null;
  }
</script>

<div class="flex flex-col gap-2">
  <div class="flex flex-col gap-1">
    <Checkbox id="{idPrefix}Enabled" checked={value !== null} onChange={toggle} {label} />
    <p class="m-0 text-sm text-muted">{hint}</p>
  </div>
  {#if value}
    <Field label={titleLabel} forId="{idPrefix}Title">
      <TextInput id="{idPrefix}Title" bind:value={value.title} maxlength={300} />
    </Field>
    <div class="grid grid-cols-2 gap-3">
      <Field label={minLabel} forId="{idPrefix}Min">
        <input
          id="{idPrefix}Min"
          type="number"
          min={MIN_CM}
          max={MAX_CM}
          step="0.5"
          bind:value={value.minHeightCm}
          onchange={() => normalize("min")}
          class={controlClass}
        />
      </Field>
      <Field label={maxLabel} forId="{idPrefix}Max">
        <input
          id="{idPrefix}Max"
          type="number"
          min={MIN_CM}
          max={MAX_CM}
          step="0.5"
          bind:value={value.maxHeightCm}
          onchange={() => normalize("max")}
          class={controlClass}
        />
      </Field>
    </div>
  {/if}
</div>
