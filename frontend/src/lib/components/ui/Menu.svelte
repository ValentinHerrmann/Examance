<script lang="ts">
  import { setContext, tick } from "svelte";
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";

  /**
   * Dropdown menu: a trigger button plus a `role="menu"` panel of <MenuItem>s.
   * Outside click and Escape close it, Escape returns focus to the trigger,
   * arrow keys / Home / End move between items.
   *
   * The trigger is styled by the caller through `triggerClass` (the navbar
   * needs white-on-slate, a toolbar needs the regular look).
   */
  export let label: string;
  export let icon: IconDefinition | undefined = undefined;
  /** Visible text next to the icon. The label is always the accessible name. */
  export let showLabel = true;
  /** Extra classes for the visible label, e.g. `hidden 2xl:inline`. */
  export let labelClass = "";
  export let chevron = true;
  export let align: "start" | "end" = "end";
  export let triggerClass =
    "inline-flex min-h-10 items-center gap-2 rounded-md border border-line-strong bg-surface-raised px-3 py-2 text-sm text-content hover:bg-surface-inset pointer-coarse:min-h-11";
  export let panelClass = "";

  let open = false;
  let root: HTMLElement;
  let trigger: HTMLButtonElement;
  let panel: HTMLElement | undefined;

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

<svelte:window on:pointerdown={onWindowPointerDown} />

<div class="relative inline-flex" bind:this={root}>
  <button
    type="button"
    bind:this={trigger}
    class={triggerClass}
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label={label}
    title={label}
    on:click={() => (open ? close(false) : show())}
    on:keydown={onTriggerKeydown}
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
      on:keydown={onPanelKeydown}
    >
      <slot close={() => close(true)} />
    </div>
  {/if}
</div>
