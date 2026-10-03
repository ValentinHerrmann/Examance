<script lang="ts">
  import type { Snippet } from "svelte";
  import { setContext, tick } from "svelte";
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";

  /**
   * Dropdown menu: trigger button plus a `role="menu"` panel of <MenuItem>s. Outside click and Escape
   * close it (Escape refocuses the trigger); arrows/Home/End move between items. Trigger styled via `triggerClass`.
   */
  interface Props {
    label: string;
    icon?: IconDefinition | undefined;
    /** Visible text next to the icon. The label is always the accessible name. */
    showLabel?: boolean;
    /** Extra classes for the visible label, e.g. `hidden 2xl:inline`. */
    labelClass?: string;
    chevron?: boolean;
    align?: "start" | "end";
    triggerClass?: string;
    panelClass?: string;
    children?: Snippet<[{ close: () => void }]>;
  }

  let {
    label,
    icon = undefined,
    showLabel = true,
    labelClass = "",
    chevron = true,
    align = "end",
    triggerClass = "inline-flex min-h-10 items-center gap-2 rounded-md border border-line-strong bg-surface-raised px-3 py-2 text-sm text-content hover:bg-surface-inset pointer-coarse:min-h-11",
    panelClass = "",
    children,
  }: Props = $props();

  let open = $state(false);
  let root: HTMLElement | undefined = $state();
  let trigger: HTMLButtonElement | undefined = $state();
  let panel: HTMLElement | undefined = $state();

  function items(): HTMLElement[] {
    return panel
      ? Array.from(panel.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])'))
      : [];
  }

  async function show(focus: "first" | "last" = "first") {
    open = true;
    await tick();
    const list = items();
    (focus === "first" ? list[0] : list[list.length - 1])?.focus();
  }

  function close(restoreFocus = true) {
    if (!open) return;
    open = false;
    if (restoreFocus) trigger?.focus();
  }

  setContext("menu", { close: () => close(true) });

  function onTriggerKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      void show("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      void show("last");
    }
  }

  function onPanelKeydown(event: KeyboardEvent) {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      close(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      list[(index + 1) % list.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      list[(index - 1 + list.length) % list.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      list[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      list[list.length - 1]?.focus();
    } else if (event.key === "Tab") {
      close(false);
    }
  }

  function onWindowPointerDown(event: PointerEvent) {
    if (open && root && !root.contains(event.target as Node)) {
      close(false);
    }
  }
</script>

<svelte:window onpointerdown={onWindowPointerDown} />

<div class="relative inline-flex" bind:this={root}>
  <button
    type="button"
    bind:this={trigger}
    class={triggerClass}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={label}
    title={label}
    onclick={() => (open ? close(false) : show())}
    onkeydown={onTriggerKeydown}
  >
    {#if icon}<Icon {icon} />{/if}
    {#if showLabel}<span class="truncate {labelClass}">{label}</span>{/if}
    {#if chevron}<Icon icon={faChevronDown} class="text-xs opacity-70" />{/if}
  </button>

  {#if open}
    <div
      bind:this={panel}
      role="menu"
      aria-label={label}
      tabindex="-1"
      class="absolute top-full mt-1 flex max-h-[min(70dvh,32rem)] min-w-48 flex-col gap-0.5 overflow-y-auto rounded-md border border-line bg-surface-raised p-1 text-content shadow-md {align ===
      'end'
        ? 'right-0'
        : 'left-0'} {panelClass}"
      style="z-index: var(--z-dropdown)"
      onkeydown={onPanelKeydown}
    >
      {@render children?.({ close: () => close(true) })}
    </div>
  {/if}
</div>
