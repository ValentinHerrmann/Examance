<script lang="ts">
  /**
   * Filter pill row (Artemis): one "All" pill plus one per option with its count; wraps in a drawer,
   * stacks in the desktop sidebar. `onSelect` receives "ALL" or an option value.
   */
  interface Props {
    selected: string;
    allLabel: string;
    options?: { value: string; label: string; count: number }[];
    onSelect: (value: string) => void;
  }

  let {
    selected,
    allLabel,
    options = [],
    onSelect,
  }: Props = $props();

  const pillBase =
    "box-border min-h-9 cursor-pointer rounded-xl border border-line bg-surface-raised px-3 py-1.5 text-left text-sm text-content hover:border-line-strong";
  const pillActive =
    "box-border min-h-9 cursor-pointer rounded-xl border border-accent bg-primary px-3 py-1.5 text-left text-sm font-semibold text-primary-contrast";
</script>

<div class="flex w-full flex-row flex-wrap gap-1.5 lg:flex-col lg:flex-nowrap">
  <button type="button" class={selected === "ALL" ? pillActive : pillBase} onclick={() => onSelect("ALL")}>
    {allLabel}
  </button>
  {#each options as option (option.value)}
    <button
      type="button"
      class={selected === option.value ? pillActive : pillBase}
      onclick={() => onSelect(option.value)}
    >
      {option.label} ({option.count})
    </button>
  {/each}
</div>
