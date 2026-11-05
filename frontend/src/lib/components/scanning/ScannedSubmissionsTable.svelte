<script lang="ts">
  import { faEraser, faEye, faPenToSquare, faScissors } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { gradeHref } from "#lib/utils/links";
  import { Button, Badge, CrossLink, Menu, MenuItem, Spinner, TableScroller, actionIcons } from "#lib/components/ui";
  import { compareText } from "#lib/utils/listSort";
  import SortHeaderCell from "#lib/components/scanning/SortHeaderCell.svelte";
  interface ScannedSubmissionItem {
    id: string;
    pseudonymHmac: string;
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
      <Button severity="danger" variant="outlined" icon={actionIcons.delete} onClick={onDeleteAll}>
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
              <td class="font-mono font-semibold text-accent" title={$t("scanning.submissionsTable.pseudonymTitle", { hash: item.pseudonymHmac })}>
                {item.studentNumber || "—"}
              </td>
              <td>
                <Badge severity={item.fallbackCode.startsWith("UNMATCHED-") ? "warning" : "primary"}>
                  {item.fallbackCode}
                </Badge>
              </td>
              <td class="whitespace-nowrap text-muted">{$fmt.dateTime(item.createdAt)}</td>
              <td>
                <!-- Everyday actions as buttons, rare and destructive ones behind ⋯, so a row stays one line (issue #212). -->
                <div class="flex items-center gap-1.5 whitespace-nowrap">
                  <Button size="sm" variant="outlined" severity="secondary" icon={faEye} onClick={() => onPreview(item)}>{$t("scanning.submissionsTable.preview")}</Button>
                  <Button size="sm" icon={faPenToSquare} href={gradeHref(examId, { submissionId: item.id })}>{$t("scanning.submissionsTable.goToGrading")}</Button>
                  <Button
                    size="sm"
                    variant="outlined"
                    severity="secondary"
                    iconOnly
                    icon={actionIcons.download}
                    loading={exportingId === item.id}
                    disabled={exportingId === item.id}
                    ariaLabel={$t("scanning.submissionsTable.exportPdf")}
                    title={$t("scanning.submissionsTable.exportPdf")}
                    onClick={() => onExportPdf(item)}
                  />
                  <Menu label={$t("scanning.submissionsTable.more")} icon={actionIcons.more} align="end">
                    {#snippet children({ close })}
                      <MenuItem icon={faScissors} onSelect={() => { close(); onSplit(item); }}>{$t("scanning.submissionsTable.split")}</MenuItem>
                      <MenuItem icon={faEraser} disabled={!isGraded(item)} onSelect={() => { close(); onDeleteGrading(item); }}>{$t("scanning.submissionsTable.deleteGrading")}</MenuItem>
                      <MenuItem icon={actionIcons.delete} danger onSelect={() => { close(); onDelete(item); }}>{$t("scanning.submissionsTable.delete")}</MenuItem>
                    {/snippet}
                  </Menu>
                </div>
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </TableScroller>
  {/if}
</div>
