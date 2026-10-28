<script lang="ts">
  import { controlClass, controlSmClass } from "#lib/components/ui";

  interface Props {
    value?: string;
    max: number;
    /** Blur and change both commit, so a save may run twice for one edit. */
    onCommit: () => void;
  }

  let { value = $bindable(""), max, onCommit }: Props = $props();

  let invalid = $derived.by(() => {
    if (value === "") return false;
    const num = parseFloat(value.replace(",", "."));
    return isNaN(num) || num < 0 || num > max;
  });

  // Enter/ArrowDown and ArrowUp move between the score fields of the same table body.
  function handleKeyDown(e: KeyboardEvent) {
    const down = e.key === "Enter" || e.key === "ArrowDown";
    if (!down && e.key !== "ArrowUp") return;
    e.preventDefault();
    const input = e.currentTarget as HTMLInputElement;
    const fields = Array.from(input.closest("tbody")?.querySelectorAll<HTMLInputElement>("input[data-score-input]") ?? []);
    const next = fields[fields.indexOf(input) + (down ? 1 : -1)];
    next?.focus();
    next?.select();
  }
</script>

<td class="whitespace-nowrap">
  <input
    type="text"
    data-score-input
    bind:value
    class="{controlClass} {controlSmClass} w-24 text-right font-semibold"
    aria-invalid={invalid ? "true" : undefined}
    placeholder="-"
    onkeydown={handleKeyDown}
    onblur={onCommit}
    onchange={onCommit}
  />
  <span class="ml-1.5 text-sm text-muted">/ {max}</span>
</td>
