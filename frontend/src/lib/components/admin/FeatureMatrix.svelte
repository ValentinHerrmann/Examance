<script lang="ts" generics="T extends { id: string; features: AccountFeatures }">
  // Admin list with one set of feature switches per row (issue #53): cards below `md`, a table from `md`.
  // Callers fill the name, extra columns and actions; the switch columns, headers and row-busy rule live here.
  import type { Snippet } from "svelte";
  import { ACCOUNT_FEATURES, FEATURE_COLUMNS, type AccountFeature, type AccountFeatures } from "#lib/api/admin";
  import { t } from "#lib/i18n";
  import { Switch, TableScroller } from "#lib/components/ui";
  import FeatureSwitches from "./FeatureSwitches.svelte";

  interface Props {
    rows: T[];
    tableLabel: string;
    /** Translated column headers: the identity column, then one per `<td>` the table variant of `meta` renders. */
    headers: string[];
    /** Plain-text row name for the switches' aria-labels. */
    rowLabel: (row: T) => string;
    hover?: boolean;
    /** Cards put the actions beside the name instead of below the switches. */
    actionsBesideName?: boolean;
    /** A row whose request is running: its switches are disabled. */
    disabled: (row: T) => boolean;
    onToggle: (row: T, key: AccountFeature, value: boolean) => void;
    identity: Snippet<[T]>;
    /** `card` true: inline pieces for the card's meta line; false: `<td>`s for the table. */
    meta?: Snippet<[T, boolean]>;
    actions: Snippet<[T, boolean]>;
  }

  let {
    rows, tableLabel, headers, rowLabel, disabled, onToggle, identity, meta, actions,
    hover = false, actionsBesideName = false,
  }: Props = $props();
</script>

<!-- Phones and small tablets: one row per entry. -->
<ul class="m-0 flex list-none flex-col gap-3 p-0 md:hidden">
  {#each rows as row (row.id)}
    <li class="flex min-w-0 flex-col gap-3 rounded-md border border-line bg-surface-base p-4">
      <div class={actionsBesideName ? "flex min-w-0 items-center justify-between gap-2" : "flex min-w-0 flex-col gap-1.5"}>
        <strong class="min-w-0 break-words text-content">{@render identity(row)}</strong>
        {#if meta}<div class="flex flex-wrap items-center gap-2 text-sm text-muted">{@render meta(row, true)}</div>{/if}
        {#if actionsBesideName}{@render actions(row, true)}{/if}
      </div>
      <FeatureSwitches
        features={row.features}
        disabled={disabled(row)}
        compact
        onChange={(key, value) => onToggle(row, key, value)}
      />
      {#if !actionsBesideName}{@render actions(row, true)}{/if}
    </li>
  {/each}
</ul>

<!-- From md: the table. -->
<div class="hidden min-w-0 md:block">
  <TableScroller label={tableLabel}>
    <table class="data-table data-table-compact w-full {hover ? 'data-table-hover' : ''}">
      <thead>
        <tr>
          {#each headers as header (header)}<th>{header}</th>{/each}
          {#each ACCOUNT_FEATURES as key (key)}<th>{$t(FEATURE_COLUMNS[key])}</th>{/each}
          <th><span class="sr-only">{$t("admin.accounts.columnActions")}</span></th>
        </tr>
      </thead>
      <tbody>
        {#each rows as row (row.id)}
          <tr>
            <td class="break-words text-content">{@render identity(row)}</td>
            {@render meta?.(row, false)}
            {#each ACCOUNT_FEATURES as key (key)}
              <td>
                <Switch
                  checked={row.features[key]}
                  disabled={disabled(row)}
                  ariaLabel={`${$t(FEATURE_COLUMNS[key])}: ${rowLabel(row)}`}
                  onChange={(value) => onToggle(row, key, value)}
                />
              </td>
            {/each}
            <td class="text-right whitespace-nowrap">{@render actions(row, false)}</td>
          </tr>
        {/each}
      </tbody>
    </table>
  </TableScroller>
</div>
