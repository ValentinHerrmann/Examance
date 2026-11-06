<script lang="ts">
  import type { Snippet } from "svelte";
  import { setContext, tick } from "svelte";
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";

  /** Dropdown menu: trigger button plus a `role="menu"` panel of <MenuItem>s. Outside click and Escape close it (Escape refocuses the trigger); arrows/Home/End move between items. Trigger styled via `triggerClass`. The panel is fixed and placed from the trigger, so scroll containers never clip it. */
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
  /** The panel's fixed position, in viewport pixels. */
  let place = $state({ top: 0, left: 0 });

  const MARGIN = 8;

  /** Below the trigger, or above it when there is more room there; aligned to the trigger's `align` edge and kept inside the viewport. */
  function position() {
    if (!trigger || !panel) return;
    const t = trigger.getBoundingClientRect();
    const { width, height } = panel.getBoundingClientRect();
    const below = window.innerHeight - t.bottom;
    const top = below < height + MARGIN && t.top > below ? t.top - height - 4 : t.bottom + 4;
    const left = align === "end" ? t.right - width : t.left;
    place = {
      top: Math.max(MARGIN, top),
      left: Math.min(Math.max(MARGIN, left), window.innerWidth - width - MARGIN),
    };
  }

  function items(): HTMLElement[] {
    return panel
      ? Array.from(panel.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([aria-disabled="true"])'))
      : [];
  }

  async function show(focus: "first" | "last" = "first") {
    open = true;
    await tick();
    position();
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

  // Any scroller (the page, a table) moves the trigger: follow it while open.
  $effect(() => {
    if (!open) return;
    const follow = () => position();
    window.addEventListener("scroll", follow, true);
    return () => window.removeEventListener("scroll", follow, true);
  });
</script>

<svelte:window onpointerdown={onWindowPointerDown} onresize={() => open && position()} />

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
      class="fixed flex max-h-[min(70dvh,32rem)] min-w-48 flex-col gap-0.5 overflow-y-auto rounded-md border border-line bg-surface-raised p-1 text-content shadow-md {panelClass}"
      style="z-index: var(--z-dropdown); top: {place.top}px; left: {place.left}px"
      onkeydown={onPanelKeydown}
    >
      {@render children?.({ close: () => close(true) })}
    </div>
  {/if}
</div>
