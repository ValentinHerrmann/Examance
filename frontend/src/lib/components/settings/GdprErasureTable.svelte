<script lang="ts">
  import "./GdprErasureTable.css";
  import type { StudentRecord } from "$lib/db/schema";
  import { t } from "$lib/i18n";

  export let students: StudentRecord[];
  export let isErasing: boolean;
  export let onErase: (pseudonymId: string, examId: string) => void;
  export let onExport: (pseudonymId: string) => void;
</script>

<div class="gdpr-erasure-table-card">
  <h3>{$t("admin.gdprErasureTable.title")}</h3>
  {#if students.length === 0}
    <p class="gdpr-erasure-table-empty">
      {$t("admin.gdprErasureTable.empty")}
    </p>
  {:else}
    <table class="gdpr-erasure-table-students-table">
      <thead>
        <tr>
          <th>{$t("admin.gdprErasureTable.columnPseudonymId")}</th>
          <th>{$t("admin.gdprErasureTable.columnFallbackCode")}</th>
          <th>{$t("admin.gdprErasureTable.columnActions")}</th>
        </tr>
      </thead>
      <tbody>
        {#each students as st}
          <tr>
            <td class="gdpr-erasure-table-mono">{st.pseudonymId}</td>
            <td>{st.fallbackCode}</td>
            <td class="gdpr-actions">
              <button
                class="gdpr-export-btn"
                on:click={() => onExport(st.pseudonymId)}
                disabled={isErasing}
              >
                {$t("admin.gdprErasureTable.exportButton")}
              </button>
              <button
                class="gdpr-erasure-table-erase-btn"
                on:click={() => onErase(st.pseudonymId, st.examId)}
                disabled={isErasing}
              >
                {$t("admin.gdprErasureTable.eraseButton")}
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>

<style>
  .gdpr-actions {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
  }

  .gdpr-export-btn {
    padding: 0.3rem 0.65rem;
    border: 1px solid #0369a1;
    border-radius: 6px;
    background: rgba(3, 105, 161, 0.15);
    color: #7dd3fc;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .gdpr-export-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
