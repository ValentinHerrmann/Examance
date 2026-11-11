<script module lang="ts">
  let nextId = 0;
</script>

<script lang="ts">
  import type { Snippet } from "svelte";
  import { faChevronDown, faChevronRight } from "@fortawesome/free-solid-svg-icons";
  import Icon from "./Icon.svelte";

  /** A titled list section that folds away (issue #252), e.g. the year groups of the exam list. Controlled: the caller owns `open`. */
  interface Props {
    title: string;
    /** Shown after the title, e.g. the number of items. */
    count?: number;
    open: boolean;
    onToggle: (open: boolean) => void;
    children: Snippet;
  }

  let { title, count, open, onToggle, children }: Props = $props();

  const bodyId = `collapsible-section-${nextId++}`;
</script>

<section class="flex flex-col gap-3">
  <h2 class="m-0 text-base font-semibold text-content">
    <button
      type="button"
      class="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-md text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:min-h-0"
      aria-expanded={open}
      aria-controls={bodyId}
      onclick={() => onToggle(!open)}
    >
      <Icon icon={open ? faChevronDown : faChevronRight} class="w-3 text-muted" />
      <span class="min-w-0 wrap-anywhere">{title}</span>
      {#if count !== undefined}
        <span class="rounded-xl border border-line bg-surface-sunken px-2 py-0.5 text-xs font-normal text-muted">{count}</span>
      {/if}
    </button>
  </h2>
  {#if open}
    <div id={bodyId} class="flex flex-col gap-4">
      {@render children()}
    </div>
  {/if}
</section>
