<script lang="ts">
  import "./UnmatchedResolver.css";
  import { t } from "$lib/i18n";
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
    <h3>{$t("scanning.unmatchedResolver.title")}</h3>
    <p class="desc">
      {$t("scanning.unmatchedResolver.description")}
    </p>

    <div class="unmatched-table">
      {#each unmatchedList as item}
        <div class="unmatched-row">
          <span class="current-tag">{item.currentFallback}</span>
          <input
            type="text"
            placeholder={$t("scanning.unmatchedResolver.placeholder")}
            bind:value={item.newCode}
          />
          <button on:click={() => onUpdateFallbackCode(item)}>{$t("scanning.unmatchedResolver.linkCode")}</button>
        </div>
      {/each}
    </div>
  </div>
{/if}
