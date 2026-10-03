<script lang="ts">
  import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";

  /**
   * Collapsible list card (Artemis group card): an always-visible header row
   * that toggles the body. The header is composed from `title`, the `badges`
   * and `actions` slots (icon buttons; clicks and keys inside never toggle
   * the card) and a `preview` slot shown only while collapsed. `body` is the
   * expanded content; `footer` is the dashed action row under it. The header
   * handles mouse and keyboard (Enter/Space) and exposes `aria-expanded`.
   */
  export let expanded = false;
  export let title: string;
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
      if (e.target !== e.currentTarget) return;
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onToggle();
      }
    }}
  >
    <div class="flex min-w-0 flex-1 items-start gap-4">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <h3 class="m-0 text-lg font-semibold break-words text-content">{title}</h3>
        <div class="flex flex-wrap items-center gap-2">
          <slot name="badges" />
          {#if $$slots.actions}
            <span on:click|stopPropagation on:keydown|stopPropagation role="presentation">
              <slot name="actions" />
            </span>
          {/if}
        </div>
      </div>
      {#if !expanded && $$slots.preview}
        <div class="mt-2 flex flex-wrap gap-2">
          <slot name="preview" />
        </div>
      {/if}
    </div>
    <span class="mt-1 shrink-0 px-2 py-1 {expanded ? "text-accent" : "text-muted"}" aria-hidden="true">
      <Icon icon={expanded ? faChevronUp : faChevronDown} />
    </span>
  </div>

  {#if expanded}
    <div class="border-t border-line bg-surface-sunken/30 px-5 pb-5 pt-4">
      <slot name="body"></slot>
      {#if $$slots.footer}
        <div class="mt-3 flex flex-wrap justify-end gap-2 border-t border-dashed border-line pt-3">
          <slot name="footer" />
        </div>
      {/if}
    </div>
  {/if}
</div>
