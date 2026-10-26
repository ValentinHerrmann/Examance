<script lang="ts">
  import type { Snippet } from "svelte";

  /** Link-styled button for a name that opens a modal in place (cross-links whose target is a dialog, issue #151). */
  interface Props {
    onClick: () => void;
    title?: string | undefined;
    class?: string;
    children: Snippet;
  }

  let { onClick, title = undefined, class: className = "", children }: Props = $props();
</script>

<button
  type="button"
  {title}
  class="min-w-0 cursor-pointer truncate border-0 bg-transparent p-0 text-left text-accent hover:underline {className}"
  onclick={(e) => {
    e.stopPropagation();
    onClick();
  }}
>{@render children()}</button>
