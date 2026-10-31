<script lang="ts">
  import { t } from "#lib/i18n";
  import { Badge } from "#lib/components/ui";
  import type { TemplatePackages } from "#lib/latex/packageSettings";
  import TemplatePackageRows from "./TemplatePackageRows.svelte";

  /** What the exam template loads by itself (issue #108), read-only. Unlocked packages can take more options through the account list (`onAdjust`); packages that bundled ones pull in are folded away. */
  interface Props {
    template: TemplatePackages;
    /** Template packages the account already passes options to. */
    adjusted: ReadonlySet<string>;
    onAdjust: (name: string) => void;
  }

  let { template, adjusted, onAdjust }: Props = $props();

  const MAIN_SOURCES = new Set(["packages", "Schulaufgabe", "Loesung"]);
  let main = $derived(template.packages.filter((p) => MAIN_SOURCES.has(p.source)));
  let bundled = $derived(template.packages.filter((p) => !MAIN_SOURCES.has(p.source)));
</script>

<div class="flex min-w-0 flex-col gap-3">
  <TemplatePackageRows packages={main} {adjusted} {onAdjust} />
  {#if bundled.length}
    <details class="min-w-0">
      <summary class="cursor-pointer text-sm text-muted">
        {$t("latexPackages.template.bundled", { count: bundled.length })}
      </summary>
      <div class="mt-2"><TemplatePackageRows packages={bundled} {adjusted} {onAdjust} /></div>
    </details>
  {/if}
  <div class="flex min-w-0 flex-col gap-1">
    <p class="m-0 text-sm font-medium text-content">{$t("latexPackages.template.libraries")}</p>
    <div class="flex flex-wrap gap-1">
      {#each template.tikz_libraries as library (library.name)}
        <Badge size="xs">{library.name}</Badge>
      {/each}
    </div>
  </div>
</div>
