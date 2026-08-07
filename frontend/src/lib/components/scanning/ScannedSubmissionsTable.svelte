<script lang="ts">
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
          <span class="badge" class:unmatched={item.fallbackCode.startsWith('UNMATCHED-')}>
            {item.fallbackCode}
          </span>
          <span class="time">{new Date(item.createdAt).toLocaleString()}</span>
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

<style>
  .scans-overview-section {
    margin-top: 2.5rem;
    background: #1e293b;
    padding: 1.5rem;
    border-radius: 10px;
    border: 1px solid #334155;
  }

  .scans-overview-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .scans-overview-header h3 {
    margin: 0;
    color: #38bdf8;
  }

  .btn-delete-all {
    padding: 0.45rem 0.85rem;
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .btn-delete-all:hover {
    background: #b91c1c;
  }

  .empty-msg {
    color: #94a3b8;
    font-size: 0.875rem;
  }

  .scans-table {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .table-header {
    display: grid;
    grid-template-columns: 1.5fr 1fr 1.2fr 1.2fr 1fr;
    gap: 0.75rem;
    font-weight: 600;
    font-size: 0.8rem;
    color: #94a3b8;
    text-transform: uppercase;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid #334155;
  }

  .table-row {
    display: grid;
    grid-template-columns: 1.5fr 1fr 1.2fr 1.2fr 1fr;
    gap: 0.75rem;
    align-items: center;
    background: #0f172a;
    padding: 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
  }

  .student-name {
    font-weight: 600;
    color: #f8fafc;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .student-number {
    font-family: monospace;
    color: #38bdf8;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    background: #0284c7;
    color: white;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .badge.unmatched {
    background: #eab308;
    color: black;
  }

  .time {
    color: #94a3b8;
    font-size: 0.8rem;
  }

  .action-buttons {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }

  .btn-preview {
    padding: 0.4rem 0.8rem;
    background: #0284c7;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.8rem;
    transition: background 0.2s ease;
  }

  .btn-preview:hover {
    background: #0369a1;
  }

  .btn-split {
    padding: 0.4rem 0.8rem;
    background: #d97706;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.8rem;
    transition: background 0.2s ease;
  }

  .btn-split:hover {
    background: #b45309;
  }

  .btn-delete {
    padding: 0.4rem 0.8rem;
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.8rem;
    transition: background 0.2s ease;
  }

  .btn-delete:hover {
    background: #b91c1c;
  }

  .btn-grade {
    padding: 0.4rem 0.8rem;
    background: #7c3aed;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.8rem;
    transition: background 0.2s ease;
  }

  .btn-grade:hover {
    background: #6d28d9;
  }

  .btn-export {
    padding: 0.4rem 0.8rem;
    background: #059669;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.8rem;
    transition: background 0.2s ease;
  }

  .btn-export:hover:not(:disabled) {
    background: #047857;
  }

  .btn-export:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .btn-delete-grading {
    padding: 0.4rem 0.8rem;
    background: #d97706;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.8rem;
    transition: background 0.2s ease;
  }

  .btn-delete-grading:hover:not(:disabled) {
    background: #b45309;
  }

  .btn-delete-grading:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
</style>
