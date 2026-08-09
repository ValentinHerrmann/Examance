<script lang="ts">
  import "./GdprErasureTable.css";
  import type { StudentRecord } from "$lib/db/schema";

  export let students: StudentRecord[];
  export let isErasing: boolean;
  export let onErase: (pseudonymId: string, examId: string) => void;
</script>

<div class="gdpr-erasure-table-card">
  <h3>GDPR Art. 17 — Manage Student Identities & Erasure</h3>
  {#if students.length === 0}
    <p class="gdpr-erasure-table-empty">
      No student identity records stored in current session.
    </p>
  {:else}
    <table class="gdpr-erasure-table-students-table">
      <thead>
        <tr>
          <th>Pseudonym ID</th>
          <th>Fallback Code</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {#each students as st}
          <tr>
            <td class="gdpr-erasure-table-mono">{st.pseudonymId}</td>
            <td>{st.fallbackCode}</td>
            <td>
              <button
                class="gdpr-erasure-table-erase-btn"
                on:click={() => onErase(st.pseudonymId, st.examId)}
                disabled={isErasing}
              >
                Erase (Art. 17)
              </button>
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  {/if}
</div>
