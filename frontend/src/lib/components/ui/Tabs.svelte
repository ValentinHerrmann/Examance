<script lang="ts">
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";

  type Item = { id: string; label: string; href?: string; icon?: IconDefinition; count?: number };

  /** Tab strip. Items are buttons; an item with `href` renders a link (route-driven tabs) and `value` marks the selected one. */
  interface Props {
    items: Item[];
    value?: string | undefined;
    label?: string | undefined;
    onChange?: ((id: string) => void) | undefined;
    class?: string;
  }

  let {
    items,
    value = items[0]?.id,
    label = undefined,
    onChange = undefined,
    class: className = "",
  }: Props = $props();

  let list: HTMLElement | undefined = $state();

  function select(id: string) {
    value = id;
    onChange?.(id);
  }

  function onKeydown(event: KeyboardEvent) {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const tabs = Array.from(list?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []);
    const current = tabs.findIndex((el) => el === document.activeElement);
    let next = current;
    if (event.key === "ArrowRight") next = (current + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (current - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else next = tabs.length - 1;
    tabs[next]?.focus();
    // Button tabs activate on focus move; link tabs wait for Enter.
    if (!items[next]?.href) select(items[next].id);
  }

  const base =
    "inline-flex shrink-0 cursor-pointer items-center gap-2 border-0 bg-transparent px-4 py-3 text-base font-semibold whitespace-nowrap no-underline pointer-coarse:min-h-11";
</script>

<div
  bind:this={list}
  role="tablist"
  aria-label={label}
  tabindex="-1"
  class="scroll-pane flex overflow-x-auto overflow-y-hidden border-b border-line {className}"
  onkeydown={onKeydown}
>
  {#each items as item (item.id)}
    {@const selected = item.id === value}
    {@const state = selected
      ? "-mb-px border-b-2 border-primary text-accent"
      : "text-muted hover:text-content"}
    {#if item.href}
      <a
        href={item.href}
        role="tab"
        aria-selected={selected ? "true" : "false"}
        tabindex={selected ? 0 : -1}
        class="{base} {state}"
        onclick={() => select(item.id)}
      >
        {#if item.icon}<Icon icon={item.icon} />{/if}{item.label}{#if item.count !== undefined}<span
            class="rounded-md bg-surface-inset px-1.5 text-sm font-normal text-muted">{item.count}</span
          >{/if}
      </a>
    {:else}
      <button
        type="button"
        role="tab"
        aria-selected={selected ? "true" : "false"}
        tabindex={selected ? 0 : -1}
        class="{base} {state}"
        onclick={() => select(item.id)}
      >
        {#if item.icon}<Icon icon={item.icon} />{/if}{item.label}{#if item.count !== undefined}<span
            class="rounded-md bg-surface-inset px-1.5 text-sm font-normal text-muted">{item.count}</span
          >{/if}
      </button>
    {/if}
  {/each}
</div>
