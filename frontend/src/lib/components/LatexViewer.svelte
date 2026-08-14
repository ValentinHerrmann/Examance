<script lang="ts">
  import "./LatexViewer.css";
  import { highlightLatexToHtml } from "$lib/latex/highlighter";

  export let code: string = "";
  export let snippet: boolean = false;
  export let maxHeight: string = "none";

  $: highlightedHtml = highlightLatexToHtml(code || "");
</script>

{#if snippet}
  <!-- highlightedHtml is produced by highlightLatexToHtml(), which HTML-escapes every
       token before wrapping it in a span. Audited in the security review; never pass
       unescaped input here. -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  <code class="font-mono text-[0.8125rem] leading-[1.4] whitespace-pre-wrap break-all text-slate-200">{@html highlightedHtml}</code>
{:else}
  <pre
    class="m-0 overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-md border border-slate-700 bg-slate-900 px-4 py-3 font-mono text-sm leading-normal text-slate-200"
    style="max-height: {maxHeight}"
  >
    <!-- eslint-disable-next-line svelte/no-at-html-tags -- escaped by highlightLatexToHtml(); see above -->
    <code class="bg-transparent p-0 font-[inherit] text-[inherit]">{@html highlightedHtml}</code></pre>
{/if}
