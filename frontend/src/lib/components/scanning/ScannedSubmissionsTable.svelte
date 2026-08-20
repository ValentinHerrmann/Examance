<script lang="ts">
  import "./ScannedSubmissionsTable.css";
  import { t } from "$lib/i18n";
  import { fmt } from "$lib/utils/format";
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

  export let scannedSubmissions: ScannedSubmissionItem[] = [];
  export let exportingId: string | null = null;
  export let isGraded: (item: ScannedSubmissionItem) => boolean;
  export let onPreview: (item: ScannedSubmissionItem) => void;
  export let onGoToGrading: (item: ScannedSubmissionItem) => void;
  export let onExportPdf: (item: ScannedSubmissionItem) => void;
  export let onSplit: (item: ScannedSubmissionItem) => void;
  export let onDeleteGrading: (item: ScannedSubmissionItem) => void;
  export let onDelete: (item: ScannedSubmissionItem) => void;
  export let onDeleteAll: () => void;
</script>

<div class="scans-overview-section">
  <div class="scans-overview-header">
    <h3>{$t("scanning.submissionsTable.title", { count: scannedSubmissions.length })}</h3>
    {#if scannedSubmissions.length > 0}
      <button class="btn-delete-all" on:click={onDeleteAll}>
        {$t("scanning.submissionsTable.deleteAll")}
      </button>
    {/if}
  </div>
  {#if scannedSubmissions.length === 0}
    <p class="empty-msg">{$t("scanning.submissionsTable.empty")}</p>
  {:else}
    <div class="scans-table">
      <div class="table-header hidden md:grid md:grid-cols-[1.5fr_1fr_1.2fr_1.2fr_1fr]">
        <span>{$t("scanning.submissionsTable.colStudentName")}</span>
        <span>{$t("scanning.submissionsTable.colStudentId")}</span>
        <span>{$t("scanning.submissionsTable.colFallbackCode")}</span>
        <span>{$t("scanning.submissionsTable.colDateIngested")}</span>
        <span>{$t("scanning.submissionsTable.colAction")}</span>
      </div>
      {#each scannedSubmissions as item}
        <div class="table-row flex flex-col gap-2 md:grid md:grid-cols-[1.5fr_1fr_1.2fr_1.2fr_1fr] md:items-center">
          <div class="flex items-center justify-between gap-2 md:contents">
            <span class="md:hidden text-xs font-semibold uppercase text-subtle">{$t("scanning.submissionsTable.colStudentName")}</span>
            <span class="student-name min-w-0" title={$t("scanning.submissionsTable.submissionIdTitle", { id: item.id })}>
              {item.studentName || $t("scanning.submissionsTable.unmatchedStudent")}
            </span>
          </div>
          <div class="flex items-center justify-between gap-2 md:contents">
            <span class="md:hidden text-xs font-semibold uppercase text-subtle">{$t("scanning.submissionsTable.colStudentId")}</span>
            <span class="student-number min-w-0" title={$t("scanning.submissionsTable.pseudonymTitle", { hash: item.pseudonymHash })}>
              {item.studentNumber || '—'}
            </span>
          </div>
          <div class="flex items-center justify-between gap-2 md:contents">
            <span class="md:hidden text-xs font-semibold uppercase text-subtle">{$t("scanning.submissionsTable.colFallbackCode")}</span>
            <span class="scanned-submissions-badge" class:unmatched={item.fallbackCode.startsWith('UNMATCHED-')}>
              {item.fallbackCode}
            </span>
          </div>
          <div class="flex items-center justify-between gap-2 md:contents">
            <span class="md:hidden text-xs font-semibold uppercase text-subtle">{$t("scanning.submissionsTable.colDateIngested")}</span>
            <span class="scanned-submissions-time">{$fmt.dateTime(item.createdAt)}</span>
          </div>
          <div class="md:contents">
            <span class="md:hidden text-xs font-semibold uppercase text-subtle">{$t("scanning.submissionsTable.colAction")}</span>
            <div class="action-buttons flex-wrap">
              <button class="btn-preview" on:click={() => onPreview(item)}>{$t("scanning.submissionsTable.preview")}</button>
              <button class="btn-grade" on:click={() => onGoToGrading(item)}>{$t("scanning.submissionsTable.goToGrading")}</button>
              <button class="btn-export" disabled={exportingId === item.id} on:click={() => onExportPdf(item)}>
                {exportingId === item.id ? $t("scanning.submissionsTable.exporting") : $t("scanning.submissionsTable.exportPdf")}
              </button>
              <button class="btn-split" on:click={() => onSplit(item)}>{$t("scanning.submissionsTable.split")}</button>
              <button class="btn-delete-grading" disabled={!isGraded(item)} on:click={() => onDeleteGrading(item)}>{$t("scanning.submissionsTable.deleteGrading")}</button>
              <button class="btn-delete" on:click={() => onDelete(item)}>{$t("scanning.submissionsTable.delete")}</button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
