<script lang="ts">
  /**
   * Filter pill row (Artemis filter row): one "All" pill plus one pill per
   * option, each showing its count. Wraps into rows when the panel is wide
   * (drawer / stacked) and stacks into a column in the desktop sidebar.
   * `selected` is the current value; `onSelect` receives "ALL" or an option
   * value.
   */
  export let selected: string;
  export let allLabel: string;
  export let options: { value: string; label: string; count: number }[] = [];
  export let onSelect: (value: string) => void;

  const pillBase =
    "box-border min-h-9 cursor-pointer rounded-xl border border-line bg-surface-raised px-3 py-1.5 text-left text-sm text-content hover:border-line-strong";
  const pillActive =
    "box-border min-h-9 cursor-pointer rounded-xl border border-accent bg-primary px-3 py-1.5 text-left text-sm font-semibold text-primary-contrast";
</script>

<div class="flex w-full flex-row flex-wrap gap-1.5 lg:flex-col lg:flex-nowrap">
  <button type="button" class={selected === "ALL" ? pillActive : pillBase} on:click={() => onSelect("ALL")}>
    {allLabel}
  </button>
  {#each options as option (option.value)}
    <button
      type="button"
      class={selected === option.value ? pillActive : pillBase}
      on:click={() => onSelect(option.value)}
    >
      {option.label} ({option.count})
    </button>
  {/each}
</div>
