<script lang="ts">
  import { t } from "$lib/i18n";
  import { Select, TextInput } from "$lib/components/ui";

  export let searchQuery: string;
  export let selectedGradeFilter: string;
  export let selectedSubjectFilter: string;
  export let availableGrades: string[];
  export let availableSubjects: string[];
</script>

<div class="mb-6 flex flex-wrap items-center gap-x-4 gap-y-3">
  <TextInput
    bind:value={searchQuery}
    placeholder={$t("dashboard.filterBar.searchPlaceholder")}
    class="min-w-60 flex-1"
  />

  {#if availableGrades.length > 0}
    <div class="flex items-center gap-2 text-sm text-content">
      <label for="dashboard-grade">{$t("dashboard.filterBar.gradeLabel")}</label>
      <Select id="dashboard-grade" bind:value={selectedGradeFilter}>
        <option value="ALL">{$t("dashboard.filterBar.allGrades")}</option>
        {#each availableGrades as g}
          <option value={g}>{$t("dashboard.filterBar.gradeOption", { grade: g })}</option>
        {/each}
      </Select>
    </div>
  {/if}

  {#if availableSubjects.length > 0}
    <div class="flex items-center gap-2 text-sm text-content">
      <label for="dashboard-subject">{$t("dashboard.filterBar.subjectLabel")}</label>
      <Select id="dashboard-subject" bind:value={selectedSubjectFilter}>
        <option value="ALL">{$t("dashboard.filterBar.allSubjects")}</option>
        {#each availableSubjects as s}
          <option value={s}>{s}</option>
        {/each}
      </Select>
    </div>
  {/if}
</div>
