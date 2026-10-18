<script lang="ts">
  import { faLock } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Badge, Button, Icon, TableScroller } from "#lib/components/ui";
  import type { TemplatePackage, TemplatePackages } from "#lib/latex/packageSettings";
  import { reasonText } from "#lib/latex/packageMessages";

  /**
   * What the exam template loads by itself (issue #108), read-only. Unlocked packages can take more options through the
   * account list (`onAdjust`); packages that bundled ones pull in are folded away.
   */
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

{#snippet rows(packages: TemplatePackage[])}
  <TableScroller>
    <table class="data-table data-table-compact w-full">
      <thead>
        <tr>
          <th>{$t("latexPackages.kind.package")}</th>
          <th>{$t("latexPackages.template.options")}</th>
          <th class="text-right"><span class="sr-only">{$t("latexPackages.template.adjust")}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each packages as pkg (pkg.name)}
          <tr>
            <td class="font-mono">{pkg.name}</td>
            <td class="max-w-64 break-words font-mono text-xs text-muted">{pkg.options || "–"}</td>
            <td class="whitespace-nowrap text-right">
              {#if pkg.locked}
                <span
                  class="inline-flex items-center gap-1 text-xs text-muted"
                  title={$t("latexPackages.template.lockedTitle", { reason: reasonText($t, pkg.locked) })}
                >
                  <Icon icon={faLock} />
                  <span class="sr-only">{$t("latexPackages.template.lockedTitle", { reason: reasonText($t, pkg.locked) })}</span>
                </span>
              {:else}
                {#if adjusted.has(pkg.name)}
                  <Badge size="xs" severity="success">{$t("latexPackages.template.adjusted")}</Badge>
                {/if}
                <Button size="sm" variant="text" onClick={() => onAdjust(pkg.name)}>
                  {$t("latexPackages.template.adjust")}
                </Button>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </TableScroller>
{/snippet}

<div class="flex min-w-0 flex-col gap-3">
  {@render rows(main)}
  {#if bundled.length}
    <details class="min-w-0">
      <summary class="cursor-pointer text-sm text-muted">
        {$t("latexPackages.template.bundled", { count: bundled.length })}
      </summary>
      <div class="mt-2">{@render rows(bundled)}</div>
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
