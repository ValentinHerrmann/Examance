<script lang="ts">
  interface UnmatchedSubmission {
    submissionId: string;
    studentId: string;
    currentFallback: string;
    newCode: string;
  }

  export let unmatchedList: UnmatchedSubmission[] = [];
  export let onUpdateFallbackCode: (item: UnmatchedSubmission) => void;
</script>

{#if unmatchedList.length > 0}
  <div class="unmatched-section">
    <h3>Unmatched Submissions (Fallback Code Entry Needed)</h3>
    <p class="desc">
      The following booklet submissions could not read a QR code
      automatically. Enter the fallback code printed on the cover page.
    </p>

    <div class="unmatched-table">
      {#each unmatchedList as item}
        <div class="unmatched-row">
          <span class="current-tag">{item.currentFallback}</span>
          <input
            type="text"
            placeholder="Enter printed fallback code (e.g. A-X7K2M9)"
            bind:value={item.newCode}
          />
          <button on:click={() => onUpdateFallbackCode(item)}>Link Code</button>
        </div>
      {/each}
    </div>
  </div>
{/if}

<style>
  .unmatched-section {
    margin-top: 2.5rem;
    background: #1e293b;
    padding: 1.5rem;
    border-radius: 10px;
    border: 1px solid #eab308;
  }

  .unmatched-section h3 {
    margin-top: 0;
    color: #fef08a;
  }

  .unmatched-section .desc {
    font-size: 0.875rem;
    color: #94a3b8;
    margin-bottom: 1rem;
  }

  .unmatched-row {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
    background: #0f172a;
    padding: 0.75rem;
    border-radius: 6px;
  }

  .current-tag {
    font-family: monospace;
    color: #fca5a5;
    font-size: 0.875rem;
  }

  .unmatched-row input {
    flex: 1;
    padding: 0.5rem;
    background: #1e293b;
    border: 1px solid #334155;
    color: white;
    border-radius: 4px;
  }

  .unmatched-row button {
    padding: 0.5rem 1rem;
    background: #0284c7;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: 600;
  }
</style>
