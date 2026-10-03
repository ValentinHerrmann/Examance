<script module lang="ts">
  let nextId = 0;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";

  /**
   * Collapsible list card (Artemis group card). The title is the real toggle button; a click
   * elsewhere on the header toggles too. Clicks/keys inside `actions` never toggle the card.
   * `preview` shows only while collapsed; `footer` is the dashed action row under `body`.
   */
  interface Props {
    expanded?: boolean;
    title: string;
    onToggle: () => void;
    badges?: Snippet;
    actions?: Snippet;
    preview?: Snippet;
    body?: Snippet;
    footer?: Snippet;
  }

  let {
    expanded = false,
    title,
    onToggle,
    badges,
    actions,
    preview,
    body,
    footer,
  }: Props = $props();

  const bodyId = `expandable-card-${nextId++}`;
</script>

<div class="rounded-xl border border-line bg-surface-raised">
  <div
    class="flex cursor-pointer items-start gap-4 rounded-t-xl p-5 transition-colors hover:bg-highlight {expanded ? '' : 'rounded-b-xl'}"
    role="presentation"
    onclick={onToggle}
  >
    <div class="flex min-w-0 flex-1 items-start gap-4">
      <div class="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <h3 class="m-0 text-lg font-semibold break-words text-content">
          <button
            type="button"
            class="cursor-pointer rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
            aria-expanded={expanded}
            aria-controls={bodyId}
            onclick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
          >{title}</button>
        </h3>
        <div class="flex flex-wrap items-center gap-2">
          {@render badges?.()}
          {#if actions}
            <span onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="presentation">
              {@render actions?.()}
            </span>
          {/if}
        </div>
      </div>
      {#if !expanded && preview}
        <div class="mt-2 flex flex-wrap gap-2">
          {@render preview?.()}
        </div>
      {/if}
    </div>
    <span class="mt-1 shrink-0 px-2 py-1 {expanded ? 'text-accent' : 'text-muted'}" aria-hidden="true">
      <Icon icon={expanded ? faChevronUp : faChevronDown} />
    </span>
  </div>

  {#if expanded}
    <div id={bodyId} class="rounded-b-xl border-t border-line bg-surface-sunken/30 px-5 pb-5 pt-4">
      {@render body?.()}
      {#if footer}
        <div class="mt-3 flex flex-wrap justify-end gap-2 border-t border-dashed border-line pt-3">
          {@render footer?.()}
        </div>
      {/if}
    </div>
  {/if}
</div>
