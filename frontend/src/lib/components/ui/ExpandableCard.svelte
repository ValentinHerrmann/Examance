<script lang="ts">
  import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";

  /**
   * Collapsible card (Artemis group card): an always-visible header row that
   * toggles the body. The `header` slot owns the header's inner layout (the
   * wrapper is a plain `min-w-0 flex-1`, so callers keep their own flex row —
   * e.g. title plus a collapsed-only preview on the right); `body` holds the
   * expandable content. The header handles mouse and keyboard (Enter/Space)
   * and exposes `aria-expanded`. Callers that know their own expanded state
   * can conditionally render collapsed previews inside the header slot.
   * Interactive content inside the header must stopPropagation on click and
   * keydown itself.
   */
  export let expanded = false;
  export let onToggle: () => void;
</script>

<div class="overflow-hidden rounded-xl border border-line bg-surface-raised">
  <div
    class="flex select-none items-start gap-4 p-5 cursor-pointer transition-colors hover:bg-highlight"
    role="button"
    tabindex="0"
    aria-expanded={expanded}
    on:click={onToggle}
    on:keydown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle();
      }
    }}
  >
    <div class="min-w-0 flex-1">
      <slot name="header"></slot>
    </div>
    <span class="mt-1 shrink-0 px-2 py-1 {expanded ? "text-accent" : "text-muted"}" aria-hidden="true">
      <Icon icon={expanded ? faChevronUp : faChevronDown} />
    </span>
  </div>

  {#if expanded}
    <div class="border-t border-line bg-surface-sunken/30 px-5 pb-5 pt-4">
      <slot name="body"></slot>
    </div>
  {/if}
</div>
