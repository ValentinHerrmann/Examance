<script lang="ts">
  import { t, tOptional } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { TableScroller } from "#lib/components/ui";
  import {
    OMR_PARAM_SPECS,
    type OmrDetectionParams,
  } from "#lib/grading/omrSettings";

  

  interface Props {
    /** Latest run's params; `null` if it predates snapshots. Missing keys (older algorithm) show "—", never a default. */
    before: Partial<OmrDetectionParams> | null;
    /** Params a new run would use. */
    after: OmrDetectionParams;
    /** Only list rows whose values differ (all rows when `before` is unknown). */
    onlyChanged?: boolean;
  }

  let { before, after, onlyChanged = false }: Props = $props();

  let rows = $derived(OMR_PARAM_SPECS.map((spec) => ({
    key: spec.key,
    before: before ? before[spec.key] : null,
    after: after[spec.key],
    changed: before !== null && before[spec.key] !== after[spec.key],
  })).filter((r) => !onlyChanged || before === null || r.changed));

  function format(value: number | boolean | null | undefined): string {
    return value === null || value === undefined
      ? $t("scanning.verify.settingsPanel.unknownValue")
      : typeof value === "boolean"
        ? $t(value ? "settings.omr.on" : "settings.omr.off")
        : $fmt.number(value);
  }
</script>

<TableScroller>
  <table class="data-table data-table-compact text-xs">
    <thead>
      <tr class="text-muted">
        <th>{$t("scanning.verify.settingsPanel.parameterColumn")}</th>
        <th class="text-right">{$t("scanning.verify.settingsPanel.lastRunColumn")}</th>
        <th class="text-right">{$t("scanning.verify.settingsPanel.currentColumn")}</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.key)}
        <tr class="{row.changed ? 'bg-warning/10 text-warning-fg' : 'text-content'}">
          <td>{$tOptional(`settings.omr.params.${row.key}.label`) ?? row.key}</td>
          <td class="text-right font-mono tabular-nums">
            {format(row.before)}
          </td>
          <td class="text-right font-mono tabular-nums {row.changed ? 'font-bold' : ''}">
            {format(row.after)}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</TableScroller>
