<script lang="ts">
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import { Icon } from "#lib/components/ui";

  interface Props {
    /** Anchor links to the sections of a long page (Artemis settings pattern): sticky left column from `lg`, scrolling top strip below. */
    items: { id: string; label: string; icon?: IconDefinition; group?: boolean }[];
    ariaLabel: string;
  }

  let { items, ariaLabel }: Props = $props();

  // Scrolls only `.app-main`: a native anchor jump also scrolls the document behind the shell. Modified clicks keep the browser default.
  function jump(e: MouseEvent, id: string) {
    const main = document.querySelector<HTMLElement>(".app-main");
    const target = document.getElementById(id);
    if (!main || !target || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
    main.scrollTo({ top: main.scrollTop + target.getBoundingClientRect().top - main.getBoundingClientRect().top - margin });
    history.replaceState(history.state, "", `#${id}`);
  }
</script>

<nav
  aria-label={ariaLabel}
  class="sticky top-0 z-10 -mx-4 mb-4 bg-surface-base px-4 py-2 sm:-mx-6 sm:px-6 lg:top-6 lg:z-auto lg:mx-0 lg:mb-0 lg:w-56 lg:shrink-0 lg:self-start lg:bg-transparent lg:p-0"
>
  <ul class="m-0 flex list-none gap-1 overflow-x-auto p-0 lg:flex-col lg:overflow-visible">
    {#each items as item (item.id)}
      <li class="shrink-0 lg:shrink {item.group ? 'lg:mt-3 lg:first:mt-0' : ''}">
        <a
          href="#{item.id}"
          onclick={(e) => jump(e, item.id)}
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap {item.group ? 'font-semibold text-content' : 'text-muted lg:pl-5'} no-underline transition-colors hover:bg-surface-inset hover:text-content pointer-coarse:min-h-11 lg:whitespace-normal"
        >
          {#if item.icon}<Icon icon={item.icon} />{/if}
          <span class="min-w-0">{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>
