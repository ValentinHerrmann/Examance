<script lang="ts">
  import { t, tOptional } from "$lib/i18n";
  import { fmt } from "$lib/utils/format";
  import { TableScroller } from "$lib/components/ui";
  import {
    OMR_PARAM_SPECS,
    type OmrDetectionParams,
  } from "$lib/grading/omrSettings";

  /** Params of the latest run; `null` when that run predates settings snapshots. A snapshot from
   *  an older algorithm version may lack keys added since — shown as "—", never as a default. */
  export let before: Partial<OmrDetectionParams> | null;
  /** Params a new run would use. */
  export let after: OmrDetectionParams;
  /** Only list rows whose values differ (all rows when `before` is unknown). */
  export let onlyChanged = false;

  $: rows = OMR_PARAM_SPECS.map((spec) => ({
    key: spec.key,
    before: before ? before[spec.key] : null,
    after: after[spec.key],
    changed: before !== null && before[spec.key] !== after[spec.key],
  })).filter((r) => !onlyChanged || before === null || r.changed);

  $: format = (value: number | boolean | null | undefined): string =>
    value === null || value === undefined
      ? $t("scanning.verify.settingsPanel.unknownValue")
      : typeof value === "boolean"
        ? $t(value ? "settings.omr.on" : "settings.omr.off")
        : $fmt.number(value);
</script>

<TableScroller>
  <table class="w-full min-w-0 border-collapse text-xs">
    <thead>
      <tr class="text-left text-muted">
        <th class="py-1 pr-3 font-medium">{$t("scanning.verify.settingsPanel.parameterColumn")}</th>
        <th class="py-1 pr-3 text-right font-medium">{$t("scanning.verify.settingsPanel.lastRunColumn")}</th>
        <th class="py-1 text-right font-medium">{$t("scanning.verify.settingsPanel.currentColumn")}</th>
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.key)}
        <tr class="border-t border-line {row.changed ? 'bg-amber-500/10 text-amber-200' : 'text-content'}">
          <td class="py-1 pr-3">{$tOptional(`settings.omr.params.${row.key}.label`) ?? row.key}</td>
          <td class="py-1 pr-3 text-right font-mono tabular-nums">
            {format(row.before)}
          </td>
          <td class="py-1 text-right font-mono tabular-nums {row.changed ? 'font-bold' : ''}">
            {format(row.after)}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</TableScroller>
