<script lang="ts">
  import { t } from "$lib/i18n";
  import { openHelp } from "$lib/stores/helpStore";
  import type { HelpTopicId } from "$lib/help/topics";

  /**
   * Micro-help for a single control, for the places where `Field`'s `hint`
   * cannot be used (a radio card's label, a toolbar button). Opens on click and
   * on hover; touch devices have no hover, so click has to work on its own.
   */
  export let text: string;
  /** When set, the popover offers a link into the full help topic. */
  export let topic: HelpTopicId | undefined = undefined;

  let className = "";
  export { className as class };

  let open = false;
  const id = `infotip-${Math.random().toString(36).slice(2, 9)}`;

  function close() {
    open = false;
  }

  function onWindowKeydown(event: KeyboardEvent) {
    if (open && event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  }
</script>

<svelte:window on:keydown={onWindowKeydown} />

<!-- svelte-ignore a11y-no-static-element-interactions -->
<span
  class="relative inline-flex {className}"
  on:mouseenter={() => (open = true)}
  on:mouseleave={close}
  on:focusout={close}
>
  <button
    type="button"
    class="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border-none bg-transparent p-0 text-xs leading-none text-subtle transition-colors hover:text-accent focus-visible:text-accent"
    aria-label={$t("help.ui.showTip")}
    aria-expanded={open}
    aria-describedby={open ? id : undefined}
    on:click|stopPropagation|preventDefault={() => (open = !open)}
  >
    ⓘ
  </button>

  {#if open}
    <span
      {id}
      role="tooltip"
      class="absolute top-full left-0 mt-1.5 w-64 max-w-[80vw] rounded-lg border border-line bg-surface-raised p-2.5 text-xs leading-relaxed font-normal text-muted shadow-lg sm:w-72"
      style="z-index: var(--z-dropdown)"
    >
      {text}
      {#if topic}
        <button
          type="button"
          class="mt-1.5 block cursor-pointer border-none bg-transparent p-0 text-xs text-accent hover:underline"
          on:click|stopPropagation|preventDefault={() => {
            close();
            openHelp(topic);
          }}
        >
          {$t("help.ui.moreInfo")} →
        </button>
      {/if}
    </span>
  {/if}
</span>
