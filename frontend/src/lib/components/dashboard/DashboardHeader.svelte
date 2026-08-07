<script lang="ts">
  export let isImporting: boolean;
  export let importStatus: string;
  export let onImportArchive: (event: Event) => void;
</script>

<div class="dashboard-header">
  <div>
    <h2>Exams Dashboard</h2>
    <p class="header-subtitle">Manage, grade, and analyze your Schulaufgabe exams</p>
  </div>
  <div class="header-actions">
    <label for="importFile" class="import-btn">
      {isImporting ? 'Importing...' : '📂 Import .bgproj'}
    </label>
    <input type="file" id="importFile" accept=".bgproj" on:change={onImportArchive} disabled={isImporting} hidden />
    <a href="/exam/new" class="create-btn">➕ Create New Exam</a>
  </div>
</div>

{#if importStatus}
  <div class="import-status">{importStatus}</div>
{/if}

<style>
  .dashboard-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  h2 {
    margin: 0;
    font-size: 1.75rem;
    color: #f8fafc;
  }

  .header-subtitle {
    margin: 0.35rem 0 0 0;
    font-size: 0.9rem;
    color: #94a3b8;
  }

  .header-actions {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .import-btn {
    padding: 0.625rem 1.25rem;
    background: #334155;
    color: white;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
  }

  .import-btn:hover {
    background: #475569;
  }

  .create-btn {
    padding: 0.625rem 1.25rem;
    background: #0284c7;
    color: white;
    text-decoration: none;
    border-radius: 6px;
    font-weight: 600;
  }

  .create-btn:hover {
    background: #0369a1;
  }

  .import-status {
    background: #0f172a;
    border: 1px solid #0284c7;
    color: #38bdf8;
    padding: 0.75rem 1rem;
    border-radius: 6px;
    margin-bottom: 1.5rem;
    font-size: 0.875rem;
  }
</style>
