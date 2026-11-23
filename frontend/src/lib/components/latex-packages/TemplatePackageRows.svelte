<script lang="ts">
  import { faLock } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Badge, Button, Icon, TableScroller } from "#lib/components/ui";
  import type { TemplatePackage } from "#lib/latex/packageSettings";
  import { reasonText } from "#lib/latex/packageMessages";

  /** One table of template packages (issue #108); see TemplatePackagesTable. */
  interface Props {
    packages: TemplatePackage[];
    adjusted: ReadonlySet<string>;
    onAdjust: (name: string) => void;
  }

  let { packages, adjusted, onAdjust }: Props = $props();
</script>

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
          <td class="font-mono">
            {pkg.name}
            {#if pkg.lazy}<Badge size="xs">{$t("latexPackages.template.lazy")}</Badge>{/if}
          </td>
          <td class="max-w-64 break-words font-mono text-xs text-muted">{pkg.options || "–"}</td>
          <td class="whitespace-nowrap text-right">
            {#if pkg.lazy}
              <span class="text-xs text-muted">–</span>
            {:else if pkg.locked}
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
