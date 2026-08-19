<script lang="ts">
  import { t } from "$lib/i18n";

  export let searchQuery: string;
  export let selectedGradeFilter: string;
  export let selectedSubjectFilter: string;
  export let availableGrades: string[];
  export let availableSubjects: string[];
</script>

<div class="flex flex-wrap items-center gap-4 mb-6">
  <input
    type="text"
    placeholder={$t("dashboard.filterBar.searchPlaceholder")}
    bind:value={searchQuery}
    class="flex-1 min-w-[240px] rounded-md border border-slate-700 bg-slate-800 px-3.5 py-2.5 text-white"
  />

  {#if availableGrades.length > 0}
    <div class="flex items-center gap-2 text-sm text-slate-300">
      <label for="dashboard-grade">{$t("dashboard.filterBar.gradeLabel")}</label>
      <select
        id="dashboard-grade"
        bind:value={selectedGradeFilter}
        class="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-[0.85rem] text-white"
      >
        <option value="ALL">{$t("dashboard.filterBar.allGrades")}</option>
        {#each availableGrades as g}
          <option value={g}>{$t("dashboard.filterBar.gradeOption", { grade: g })}</option>
        {/each}
      </select>
    </div>
  {/if}

  {#if availableSubjects.length > 0}
    <div class="flex items-center gap-2 text-sm text-slate-300">
      <label for="dashboard-subject">{$t("dashboard.filterBar.subjectLabel")}</label>
      <select
        id="dashboard-subject"
        bind:value={selectedSubjectFilter}
        class="rounded-md border border-slate-700 bg-slate-800 px-3 py-2 text-[0.85rem] text-white"
      >
        <option value="ALL">{$t("dashboard.filterBar.allSubjects")}</option>
        {#each availableSubjects as s}
          <option value={s}>{s}</option>
        {/each}
      </select>
    </div>
  {/if}
</div>
