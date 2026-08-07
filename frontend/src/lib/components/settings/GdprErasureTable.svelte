<script lang="ts">
  import type { StudentRecord } from "$lib/db/schema";

  export let students: StudentRecord[];
  export let isErasing: boolean;
  export let onErase: (pseudonymId: string, examId: string) => void;
</script>

<div class="card">
  <h3>GDPR Art. 17 — Manage Student Identities & Erasure</h3>
  {#if students.length === 0}
    <p class="empty">
      No student identity records stored in current session.
    </p>
  {:else}
    <table class="students-table">
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
            <td class="mono">{st.pseudonymId}</td>
            <td>{st.fallbackCode}</td>
            <td>
              <button
                class="erase-btn"
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

<style>
  .card {
    background: #1e293b;
    padding: 1.5rem;
    border-radius: 10px;
    margin-bottom: 2rem;
    border: 1px solid #334155;
  }

  .students-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 1rem;
  }

  th,
  td {
    padding: 0.75rem;
    text-align: left;
    border-bottom: 1px solid #334155;
  }

  .mono {
    font-family: monospace;
    font-size: 0.875rem;
    color: #38bdf8;
  }

  .erase-btn {
    background: #ef4444;
    color: white;
    border: none;
    padding: 0.375rem 0.75rem;
    border-radius: 4px;
    cursor: pointer;
  }

  .empty {
    color: #94a3b8;
    font-size: 0.875rem;
  }
</style>
