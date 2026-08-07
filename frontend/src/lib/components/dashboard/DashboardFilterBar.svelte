<script lang="ts">
  export let searchQuery: string;
  export let selectedGradeFilter: string;
  export let selectedSubjectFilter: string;
  export let availableGrades: string[];
  export let availableSubjects: string[];
</script>

<div class="dashboard-filter-bar">
  <input
    type="text"
    placeholder="Search exams by title, class, subject..."
    bind:value={searchQuery}
    class="dashboard-search-input"
  />

  {#if availableGrades.length > 0}
    <div class="select-group">
      <label for="dashboard-grade">Grade:</label>
      <select id="dashboard-grade" bind:value={selectedGradeFilter}>
        <option value="ALL">All Grades</option>
        {#each availableGrades as g}
          <option value={g}>Grade {g}</option>
        {/each}
      </select>
    </div>
  {/if}

  {#if availableSubjects.length > 0}
    <div class="select-group">
      <label for="dashboard-subject">Subject:</label>
      <select id="dashboard-subject" bind:value={selectedSubjectFilter}>
        <option value="ALL">All Subjects</option>
        {#each availableSubjects as s}
          <option value={s}>{s}</option>
        {/each}
      </select>
    </div>
  {/if}
</div>

<style>
  .dashboard-filter-bar {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 1.5rem;
  }

  .dashboard-search-input {
    flex: 1;
    min-width: 240px;
    padding: 0.625rem 0.875rem;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 6px;
    color: white;
  }

  .select-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #cbd5e1;
    font-size: 0.875rem;
  }

  .select-group select {
    background: #1e293b;
    border: 1px solid #334155;
    color: white;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    font-size: 0.85rem;
  }
</style>
