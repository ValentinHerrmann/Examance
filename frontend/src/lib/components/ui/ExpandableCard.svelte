<script context="module" lang="ts">
  let nextId = 0;
</script>

<script lang="ts">
  import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";

  /**
   * Collapsible list card (Artemis group card): an always-visible header row
   * that toggles the body. The header is composed from `title`, the `badges`
   * and `actions` slots (icon buttons; clicks and keys inside never toggle
   * the card) and a `preview` slot shown only while collapsed. `body` is the
   * expanded content; `footer` is the dashed action row under it.
   *
   * The title is the real toggle button (focusable, Enter/Space, `aria-expanded`,
   * `aria-controls`); a click anywhere else on the header toggles too, as a
   * mouse convenience, so the actions are never nested inside a button.
   */
  export let expanded = false;
  export let title: string;
  export let onToggle: () => void;

  const bodyId = `expandable-card-${nextId++}`;
</script>

<div class="rounded-xl border border-line bg-surface-raised">
  <div
    class="flex cursor-pointer items-start gap-4 rounded-t-xl p-5 transition-colors hover:bg-highlight {expanded ? '' : 'rounded-b-xl'}"
    role="presentation"
    on:click={onToggle}
  >
    <div class="flex min-w-0 flex-1 items-start gap-4">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <h3 class="m-0 text-lg font-semibold break-words text-content">
          <button
            type="button"
            class="cursor-pointer rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            aria-expanded={expanded}
            aria-controls={bodyId}
            on:click|stopPropagation={onToggle}
          >{title}</button>
        </h3>
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
    <span class="mt-1 shrink-0 px-2 py-1 {expanded ? 'text-accent' : 'text-muted'}" aria-hidden="true">
      <Icon icon={expanded ? faChevronUp : faChevronDown} />
    </span>
  </div>

  {#if expanded}
    <div id={bodyId} class="rounded-b-xl border-t border-line bg-surface-sunken/30 px-5 pb-5 pt-4">
      <slot name="body"></slot>
      {#if $$slots.footer}
        <div class="mt-3 flex flex-wrap justify-end gap-2 border-t border-dashed border-line pt-3">
          <slot name="footer" />
        </div>
      {/if}
    </div>
  {/if}
</div>
