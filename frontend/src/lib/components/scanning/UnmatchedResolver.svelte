<script lang="ts">
  import "./UnmatchedResolver.css";
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
