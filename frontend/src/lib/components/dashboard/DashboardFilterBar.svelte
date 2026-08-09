<script lang="ts">
  export let searchQuery: string;
  export let selectedGradeFilter: string;
  export let selectedSubjectFilter: string;
  export let availableGrades: string[];
  export let availableSubjects: string[];
</script>

<div class="flex flex-wrap items-center gap-4 mb-6">
  <input
    type="text"
    placeholder="Search exams by title, class, subject..."
    bind:value={searchQuery}
    class="flex-1 min-w-[240px] rounded-md border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-white"
  />

  {#if availableGrades.length > 0}
    <div class="flex items-center gap-2 text-sm text-slate-300">
      <label for="dashboard-grade">Grade:</label>
      <select
        id="dashboard-grade"
        bind:value={selectedGradeFilter}
        class="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-[0.85rem] text-white"
      >
        <option value="ALL">All Grades</option>
        {#each availableGrades as g}
          <option value={g}>Grade {g}</option>
        {/each}
      </select>
    </div>
  {/if}

  {#if availableSubjects.length > 0}
    <div class="flex items-center gap-2 text-sm text-slate-300">
      <label for="dashboard-subject">Subject:</label>
      <select
        id="dashboard-subject"
        bind:value={selectedSubjectFilter}
        class="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-[0.85rem] text-white"
      >
        <option value="ALL">All Subjects</option>
        {#each availableSubjects as s}
          <option value={s}>{s}</option>
        {/each}
      </select>
    </div>
  {/if}
</div>
