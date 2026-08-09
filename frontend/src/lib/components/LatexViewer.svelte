<script lang="ts">
  import { highlightLatexToHtml } from "$lib/latex/highlighter";

  export let code: string = "";
  export let snippet: boolean = false;
  export let maxHeight: string = "none";

  $: highlightedHtml = highlightLatexToHtml(code || "");
</script>

{#if snippet}
  <code class="font-mono text-[0.8125rem] leading-[1.4] whitespace-pre-wrap break-all text-slate-200">{@html highlightedHtml}</code>
{:else}
  <pre
    class="m-0 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-slate-700 bg-slate-900 px-4 py-3 font-mono text-sm leading-normal text-slate-200"
    style="max-height: {maxHeight}"
  ><code class="bg-transparent p-0 font-[inherit] text-[inherit]">{@html highlightedHtml}</code></pre>
{/if}

<style>
  :global(.token-comment) {
    color: #94a3b8;
    font-style: italic;
  }
  :global(.token-keyword) {
    color: #ec4899;
    font-weight: bold;
  }
  :global(.token-macro) {
    color: #38bdf8;
    font-weight: 600;
  }
  :global(.token-bracket) {
    color: #f59e0b;
  }
  :global(.token-string) {
    color: #a855f7;
  }
  :global(.token-number) {
    color: #10b981;
  }
</style>
