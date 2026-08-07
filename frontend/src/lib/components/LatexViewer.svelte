<script lang="ts">
  import "./LatexViewer.css";
  import { highlightLatexToHtml } from "$lib/latex/highlighter";

  export let code: string = "";
  export let snippet: boolean = false;
  export let maxHeight: string = "none";

  $: highlightedHtml = highlightLatexToHtml(code || "");
</script>

{#if snippet}
  <code class="latex-viewer-snippet">{@html highlightedHtml}</code>
{:else}
  <pre class="latex-viewer-container" style="max-height: {maxHeight}"><code>{@html highlightedHtml}</code></pre>
{/if}
