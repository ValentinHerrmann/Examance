<script lang="ts">
  import type { IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import { Icon } from "$lib/components/ui";

  /**
   * Artemis settings pattern: anchor links to the sections of a long page.
   * From `lg` a sticky column on the left; on phones and tablets a horizontally
   * scrolling strip pinned to the top of the scroll area.
   */
  export let items: { id: string; label: string; icon?: IconDefinition }[];
  export let ariaLabel: string;
</script>

<nav
  aria-label={ariaLabel}
  class="sticky top-0 z-10 -mx-4 mb-4 bg-surface-base px-4 py-2 sm:-mx-6 sm:px-6 lg:top-6 lg:z-auto lg:mx-0 lg:mb-0 lg:w-56 lg:shrink-0 lg:self-start lg:bg-transparent lg:p-0"
>
  <ul class="m-0 flex list-none gap-1 overflow-x-auto p-0 lg:flex-col lg:overflow-visible">
    {#each items as item (item.id)}
      <li class="shrink-0 lg:shrink">
        <a
          href="#{item.id}"
          class="flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap text-muted no-underline transition-colors hover:bg-surface-inset hover:text-content pointer-coarse:min-h-11 lg:whitespace-normal"
        >
          {#if item.icon}<Icon icon={item.icon} />{/if}
          <span class="min-w-0">{item.label}</span>
        </a>
      </li>
    {/each}
  </ul>
</nav>
