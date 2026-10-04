<script lang="ts">
  // Shows what a .bgproj import or export actually did: real counts per kind, what an exam links
  // but is missing, what an export withheld, and the technical problems (collected HTTP errors)
  // that used to surface as pop-ups. Mounted once in the root layout, driven by `archiveReportPrompt`.
  import { t, tOptional } from '#lib/i18n';
  import { Modal, Button, Alert, TableScroller } from '#lib/components/ui';
  import { archiveReportPrompt } from '#lib/stores/archiveReport';
  import { REPORT_KINDS, REPORT_OUTCOMES, type ReportOutcome } from '#lib/archive/report';

  let prompt = $derived($archiveReportPrompt);
  let report = $derived(prompt?.report ?? null);
  let isImport = $derived(report?.direction === 'import');

  let rows = $derived(report ? REPORT_KINDS.filter((k) => Object.values(report.counts[k] ?? {}).some((n) => (n ?? 0) > 0)) : []);
  let columns = $derived(
    report ? REPORT_OUTCOMES.filter((o) => rows.some((k) => (report.counts[k]?.[o] ?? 0) > 0)) : ([] as ReportOutcome[])
  );
  let failedCount = $derived(report ? rows.reduce((sum, k) => sum + (report.counts[k]?.failed ?? 0), 0) : 0);
  let hasGaps = $derived(!!report && (report.missing.length > 0 || failedCount > 0 || report.problems.length > 0));

  const kindLabel = (kind: string) => $tOptional(`workspace.archiveReport.kind.${kind}`) ?? kind;
  const outcomeLabel = (outcome: string) => $tOptional(`workspace.archiveReport.outcome.${outcome}`) ?? outcome;
  const reasonLabel = (reason: string) => $tOptional(`workspace.archiveReport.missingReason.${reason}`) ?? reason;
  const withheldLabel = (item: string) => $tOptional(`workspace.archiveReport.withheldItem.${item}`) ?? item;
</script>

<Modal
  open={!!report}
  size="large"
  title={isImport ? $t('workspace.archiveReport.importTitle') : $t('workspace.archiveReport.exportTitle')}
  onClose={() => prompt?.close()}
>
  {#if report}
    <div class="flex flex-col gap-4">
      {#if report.filename}
        <p class="min-w-0 truncate text-sm text-muted">{report.filename}</p>
      {/if}

      {#if hasGaps}
        <Alert severity="warning">
          {isImport ? $t('workspace.archiveReport.importWithGaps') : $t('workspace.archiveReport.exportWithGaps')}
        </Alert>
      {:else}
        <Alert severity="success">
          {isImport ? $t('workspace.archiveReport.importComplete') : $t('workspace.archiveReport.exportComplete')}
        </Alert>
      {/if}

      {#if report.codeWithheld}
        <Alert severity="info">
          {isImport ? $t('workspace.archiveReport.resultsOnlyImport') : $t('workspace.archiveReport.resultsOnlyExport')}
        </Alert>
      {/if}

      {#if rows.length > 0}
        <section class="min-w-0">
          <h3 class="mb-2 text-sm font-semibold text-content">
            {isImport ? $t('workspace.archiveReport.countsImported') : $t('workspace.archiveReport.countsExported')}
          </h3>
          <TableScroller label={$t('workspace.archiveReport.countsImported')}>
            <table class="data-table data-table-compact data-table-striped">
              <thead>
                <tr>
                  <th scope="col">{$t('workspace.archiveReport.kindHeading')}</th>
                  {#each columns as outcome (outcome)}
                    <th scope="col" class="text-right">{outcomeLabel(outcome)}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each rows as kind (kind)}
                  <tr>
                    <th scope="row" class="font-normal">{kindLabel(kind)}</th>
                    {#each columns as outcome (outcome)}
                      {@const n = report.counts[kind]?.[outcome] ?? 0}
                      <td class="text-right tabular-nums {outcome === 'failed' && n > 0 ? 'text-danger-fg' : ''}">
                        {n > 0 ? n : '–'}
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </TableScroller>
          {#if isImport}
            <p class="mt-2 text-xs text-muted">{$t('workspace.archiveReport.outcomeHint')}</p>
          {/if}
        </section>
      {:else}
        <p class="text-sm text-muted">{$t('workspace.archiveReport.nothing')}</p>
      {/if}

      {#if report.missing.length > 0}
        <section class="min-w-0">
          <h3 class="mb-1 text-sm font-semibold text-content">
            {isImport ? $t('workspace.archiveReport.missingHeadingImport') : $t('workspace.archiveReport.missingHeadingExport')}
          </h3>
          <ul class="flex flex-col gap-1 text-sm">
            {#each report.missing as item, i (i)}
              <li class="min-w-0 break-words">
                <span class="font-medium text-content">{item.exam}</span>
                <span class="text-muted">· {reasonLabel(item.reason)}</span>
                {#if item.item}<span class="text-content">: {item.item}</span>{/if}
                {#if (item.count ?? 1) > 1}<span class="text-muted"> (×{item.count})</span>{/if}
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if report.withheld.length > 0}
        <section class="min-w-0">
          <h3 class="mb-1 text-sm font-semibold text-content">{$t('workspace.archiveReport.withheldHeading')}</h3>
          <ul class="list-disc pl-5 text-sm text-muted">
            {#each report.withheld as item (item)}
              <li>{withheldLabel(item)}</li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if report.problems.length > 0}
        <details class="min-w-0 rounded-md border border-line px-3 py-2 text-sm">
          <summary class="cursor-pointer text-content">
            {$t('workspace.archiveReport.problemsHeading', { count: report.problems.length })}
          </summary>
          <ul class="mt-2 flex flex-col gap-1 text-xs text-muted">
            {#each report.problems as problem, i (i)}
              <li class="break-words">{problem}</li>
            {/each}
          </ul>
        </details>
      {/if}
    </div>
  {/if}

  {#snippet footer()}
    <Button onClick={() => prompt?.close()}>{$t('workspace.archiveReport.close')}</Button>
  {/snippet}
</Modal>
