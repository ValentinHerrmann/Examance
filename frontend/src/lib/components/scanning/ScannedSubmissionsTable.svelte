<script lang="ts">
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { gradeHref } from "#lib/utils/links";
  import { Button, Badge, CrossLink, Spinner, TableScroller } from "#lib/components/ui";
  import { compareText } from "#lib/utils/listSort";
  import SortHeaderCell from "#lib/components/scanning/SortHeaderCell.svelte";
  interface ScannedSubmissionItem {
    id: string;
    pseudonymHash: string;
    fallbackCode: string;
    studentName?: string;
    studentNumber?: string;
    createdAt: string;
    scanCt?: Uint8Array;
    scanIv?: Uint8Array;
    totalScore?: number;
    annotationCt?: Uint8Array;
    annotationIv?: Uint8Array;
  }

  interface Props {
    examId: string;
    scannedSubmissions?: ScannedSubmissionItem[];
    /** True while the submissions list is still loading — suppresses the empty state so a slow fetch cannot look like "nothing here yet". */
    loading?: boolean;
    exportingId?: string | null;
    isGraded: (item: ScannedSubmissionItem) => boolean;
    onPreview: (item: ScannedSubmissionItem) => void;
    onExportPdf: (item: ScannedSubmissionItem) => void;
    onSplit: (item: ScannedSubmissionItem) => void;
    onDeleteGrading: (item: ScannedSubmissionItem) => void;
    onDelete: (item: ScannedSubmissionItem) => void;
    onDeleteAll: () => void;
  }

  let {
    examId,
    scannedSubmissions = [],
    loading = false,
    exportingId = null,
    isGraded,
    onPreview,
    onExportPdf,
    onSplit,
    onDeleteGrading,
    onDelete,
    onDeleteAll
  }: Props = $props();

  type SortColumn = "studentName" | "studentNumber" | "createdAt";
  let sort = $state<{ column: SortColumn; dir: "asc" | "desc" } | null>(null);

  function toggleSort(column: SortColumn) {
    sort = { column, dir: sort?.column === column && sort.dir === "asc" ? "desc" : "asc" };
  }

  // Empty names/ids go last in either direction; the source order is the tiebreak (stable sort).
  let rows = $derived.by(() => {
    if (!sort) return scannedSubmissions;
    const { column, dir } = sort;
    const sign = dir === "asc" ? 1 : -1;
    return [...scannedSubmissions].sort((a, b) => {
      const x = a[column] ?? "";
      const y = b[column] ?? "";
      if (Boolean(x) !== Boolean(y)) return x ? -1 : 1;
      const order = column === "createdAt" ? x.localeCompare(y) : compareText(x, y);
      return sign * order;
    });
  });

  const directionOf = (column: SortColumn) => (sort?.column === column ? sort.dir : null);
</script>

<div class="mt-10 min-w-0 rounded-xl border border-line bg-surface-raised p-4 sm:p-6">
  <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
    <h2 class="m-0 min-w-0 text-lg font-semibold text-content">{$t("scanning.submissionsTable.title", { count: scannedSubmissions.length })}</h2>
    {#if scannedSubmissions.length > 0}
      <Button severity="danger" variant="outlined" onClick={onDeleteAll}>
        {$t("scanning.submissionsTable.deleteAll")}
      </Button>
    {/if}
  </div>
  {#if loading}
    <div class="flex flex-col items-center gap-3 py-8 text-center" role="status">
      <Spinner class="text-2xl text-accent" />
      <p class="m-0 text-sm text-muted">{$t("scanning.submissionsTable.loading")}</p>
    </div>
  {:else if scannedSubmissions.length === 0}
    <p class="text-sm text-muted">{$t("scanning.submissionsTable.empty")}</p>
  {:else}
    <TableScroller label={$t("scanning.submissionsTable.title", { count: scannedSubmissions.length })}>
      <table class="data-table data-table-hover">
        <thead>
          <tr>
            <SortHeaderCell label={$t("scanning.submissionsTable.colStudentName")} direction={directionOf("studentName")} onToggle={() => toggleSort("studentName")} />
            <SortHeaderCell label={$t("scanning.submissionsTable.colStudentId")} direction={directionOf("studentNumber")} onToggle={() => toggleSort("studentNumber")} />
            <th scope="col">{$t("scanning.submissionsTable.colFallbackCode")}</th>
            <SortHeaderCell label={$t("scanning.submissionsTable.colDateIngested")} direction={directionOf("createdAt")} onToggle={() => toggleSort("createdAt")} />
            <th scope="col">{$t("scanning.submissionsTable.colAction")}</th>
          </tr>
        </thead>
        <tbody>
          {#each rows as item}
            <tr>
              <td class="max-w-60 truncate font-semibold" title={$t("scanning.submissionsTable.submissionIdTitle", { id: item.id })}>
                <CrossLink href={gradeHref(examId, { submissionId: item.id })} class="text-content">{item.studentName || $t("scanning.submissionsTable.unmatchedStudent")}</CrossLink>
              </td>
              <td class="font-mono font-semibold text-accent" title={$t("scanning.submissionsTable.pseudonymTitle", { hash: item.pseudonymHash })}>
                {item.studentNumber || "—"}
              </td>
              <td>
                <Badge severity={item.fallbackCode.startsWith("UNMATCHED-") ? "warning" : "primary"}>
                  {item.fallbackCode}
                </Badge>
              </td>
              <td class="whitespace-nowrap text-muted">{$fmt.dateTime(item.createdAt)}</td>
              <td>
                <div class="flex min-w-72 flex-wrap items-center gap-2">
                  <Button size="sm" variant="outlined" onClick={() => onPreview(item)}>{$t("scanning.submissionsTable.preview")}</Button>
                  <Button size="sm" href={gradeHref(examId, { submissionId: item.id })}>{$t("scanning.submissionsTable.goToGrading")}</Button>
                  <Button size="sm" variant="outlined" severity="success" disabled={exportingId === item.id} onClick={() => onExportPdf(item)}>
                    {exportingId === item.id ? $t("scanning.submissionsTable.exporting") : $t("scanning.submissionsTable.exportPdf")}
                  </Button>
                  <Button size="sm" variant="outlined" severity="warning" onClick={() => onSplit(item)}>{$t("scanning.submissionsTable.split")}</Button>
                  <Button size="sm" variant="outlined" severity="warning" disabled={!isGraded(item)} onClick={() => onDeleteGrading(item)}>{$t("scanning.submissionsTable.deleteGrading")}</Button>
                  <Button size="sm" variant="outlined" severity="danger" onClick={() => onDelete(item)}>{$t("scanning.submissionsTable.delete")}</Button>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </TableScroller>
  {/if}
</div>
