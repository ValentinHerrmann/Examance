<script lang="ts">
  import './DashboardHeader.css';

  export let isImporting: boolean;
  export let importStatus: string;
  export let onImportArchive: (event: Event) => void;
</script>

<div class="dashboard-header-dashboard-header">
  <div>
    <h2>Exams Dashboard</h2>
    <p class="dashboard-header-header-subtitle">Manage, grade, and analyze your Schulaufgabe exams</p>
  </div>
  <div class="dashboard-header-header-actions">
    <label for="importFile" class="dashboard-header-import-btn">
      {isImporting ? 'Importing...' : '📂 Import .bgproj'}
    </label>
    <input type="file" id="importFile" accept=".bgproj" on:change={onImportArchive} disabled={isImporting} hidden />
    <a href="/exam/new" class="dashboard-header-create-btn">➕ Create New Exam</a>
  </div>
</div>

{#if importStatus}
  <div class="dashboard-header-import-status">{importStatus}</div>
{/if}
