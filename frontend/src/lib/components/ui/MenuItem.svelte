<script lang="ts">
  import { getContext } from "svelte";
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";

  /** One entry of a <Menu>. Selecting it runs `onSelect` and closes the menu. */
  export let icon: IconDefinition | undefined = undefined;
  export let href: string | undefined = undefined;
  export let danger = false;
  export let disabled = false;
  /** Radio-style menus (theme, language): marks the current choice. */
  export let checked: boolean | undefined = undefined;
  export let onSelect: (() => void) | undefined = undefined;

  const menu = getContext<{ close: () => void } | undefined>("menu");

  function select(event: MouseEvent) {
    if (disabled) {
      event.preventDefault();
      return;
    }
    onSelect?.();
    menu?.close();
  }

  $: classes =
    "flex w-full cursor-pointer items-center gap-2.5 rounded-md border-0 bg-transparent px-3 py-2 text-start text-sm font-medium no-underline " +
    "hover:bg-surface-inset focus:bg-highlight focus:outline-none focus-visible:bg-highlight pointer-coarse:min-h-11 " +
    (danger ? "text-danger-fg" : "text-content") +
    (disabled ? " cursor-not-allowed opacity-60" : "");
</script>

{#if href && !disabled}
  <a {href} role="menuitem" tabindex="-1" class={classes} on:click={select}>
    {#if icon}<Icon {icon} class="w-4 text-muted" />{/if}
    <span class="min-w-0 flex-1 truncate"><slot /></span>
  </a>
{:else}
  <button
    type="button"
    role={checked === undefined ? "menuitem" : "menuitemradio"}
    aria-checked={checked === undefined ? undefined : checked}
    aria-disabled={disabled ? "true" : undefined}
    tabindex="-1"
    class={classes}
    on:click={select}
  >
    {#if icon}<Icon {icon} class="w-4 {danger ? '' : 'text-muted'}" />{/if}
    <span class="min-w-0 flex-1 truncate"><slot /></span>
    {#if checked}
      <span class="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true"></span>
    {/if}
  </button>
{/if}
