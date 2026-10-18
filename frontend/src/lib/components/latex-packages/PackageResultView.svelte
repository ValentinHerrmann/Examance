<script lang="ts">
  import { t } from "#lib/i18n";
  import { packagePreamble, resolvePackages, type PackageLayer } from "#lib/latex/packages";
  import PackageNotes from "./PackageNotes.svelte";

  /** The merged packages of `layers` as the document will start, plus what the merge changed or left out (#108). */
  interface Props {
    layers: PackageLayer[];
  }

  let { layers }: Props = $props();

  let resolved = $derived(resolvePackages(layers));
  let preamble = $derived(packagePreamble(resolved));
</script>

<div class="flex min-w-0 flex-col gap-2">
  <p class="m-0 text-xs text-muted">{$t("latexPackages.result.description")}</p>
  {#if preamble}
    <pre class="m-0 max-h-64 overflow-auto rounded-md border border-line bg-surface-sunken p-3 text-xs text-content">{preamble}</pre>
  {:else}
    <p class="m-0 text-sm text-muted">{$t("latexPackages.result.none")}</p>
  {/if}
  <PackageNotes notes={resolved.notes} />
</div>
