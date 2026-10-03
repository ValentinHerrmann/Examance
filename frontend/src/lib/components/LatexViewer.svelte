<script lang="ts">
  import { highlightLatexToHtml } from "$lib/latex/highlighter";

  interface Props {
    code?: string;
    snippet?: boolean;
    maxHeight?: string;
  }

  let { code = "", snippet = false, maxHeight = "none" }: Props = $props();

  let highlightedHtml = $derived(highlightLatexToHtml(code || ""));
</script>

{#if snippet}
  <!-- highlightedHtml comes from highlightLatexToHtml(), which HTML-escapes every token; never pass unescaped input. -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  <code class="font-mono text-xs leading-snug whitespace-pre-wrap break-all text-content">{@html highlightedHtml}</code>
{:else}
  <pre
    class="m-0 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-line bg-surface-sunken px-4 py-3 font-mono text-sm leading-normal text-content"
    style="max-height: {maxHeight}"
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- escaped by highlightLatexToHtml(); see above -->
    <code class="bg-transparent p-0 font-[inherit] text-inherit">{@html highlightedHtml}</code></pre>
{/if}

<style>
  :global(.token-comment) {
    color: var(--color-syntax-comment);
    font-style: italic;
  }
  :global(.token-keyword) {
    color: var(--color-syntax-keyword);
    font-weight: bold;
  }
  :global(.token-macro) {
    color: var(--color-syntax-macro);
    font-weight: 600;
  }
  :global(.token-bracket) {
    color: var(--color-syntax-bracket);
  }
  :global(.token-string) {
    color: var(--color-syntax-string);
  }
  :global(.token-number) {
    color: var(--color-syntax-number);
  }
</style>
