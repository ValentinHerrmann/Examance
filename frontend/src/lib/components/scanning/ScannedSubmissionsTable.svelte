<script lang="ts">
  import "./ScannedSubmissionsTable.css";
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
    <h3>Ingested Scans ({scannedSubmissions.length})</h3>
    {#if scannedSubmissions.length > 0}
      <button class="btn-delete-all" on:click={onDeleteAll}>
        Delete All Scans
      </button>
    {/if}
  </div>
  {#if scannedSubmissions.length === 0}
    <p class="empty-msg">No scans ingested for this exam yet.</p>
  {:else}
    <div class="scans-table">
      <div class="table-header">
        <span>Student Name</span>
        <span>Student ID</span>
        <span>Fallback Code</span>
        <span>Date Ingested</span>
        <span>Action</span>
      </div>
      {#each scannedSubmissions as item}
        <div class="table-row">
          <span class="student-name" title={`Submission ID: ${item.id}`}>
            {item.studentName || 'Unmatched Student'}
          </span>
          <span class="student-number" title={`Pseudonym: ${item.pseudonymHash}`}>
            {item.studentNumber || '—'}
          </span>
          <span class="scanned-submissions-badge" class:unmatched={item.fallbackCode.startsWith('UNMATCHED-')}>
            {item.fallbackCode}
          </span>
          <span class="scanned-submissions-time">{new Date(item.createdAt).toLocaleString()}</span>
          <div class="action-buttons">
            <button class="btn-preview" on:click={() => onPreview(item)}>Preview Scan</button>
            <button class="btn-grade" on:click={() => onGoToGrading(item)}>Go to Grading</button>
            <button class="btn-export" disabled={exportingId === item.id} on:click={() => onExportPdf(item)}>
              {exportingId === item.id ? 'Exporting…' : 'Export PDF'}
            </button>
            <button class="btn-split" on:click={() => onSplit(item)}>Split</button>
            <button class="btn-delete-grading" disabled={!isGraded(item)} on:click={() => onDeleteGrading(item)}>Delete Grading</button>
            <button class="btn-delete" on:click={() => onDelete(item)}>Delete</button>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>
