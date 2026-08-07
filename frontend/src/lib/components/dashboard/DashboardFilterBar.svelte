<script lang="ts">
  import './DashboardFilterBar.css';

  export let searchQuery: string;
  export let selectedGradeFilter: string;
  export let selectedSubjectFilter: string;
  export let availableGrades: string[];
  export let availableSubjects: string[];
</script>

<div class="dashboard-filter-bar-dashboard-filter-bar">
  <input
    type="text"
    placeholder="Search exams by title, class, subject..."
    bind:value={searchQuery}
    class="dashboard-filter-bar-dashboard-search-input"
  />

  {#if availableGrades.length > 0}
    <div class="dashboard-filter-bar-select-group">
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
    <div class="dashboard-filter-bar-select-group">
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
