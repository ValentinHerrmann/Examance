<script lang="ts">
  import { t } from "$lib/i18n";
  import { FilterPills, TextInput, Select } from "$lib/components/ui";

  export let searchQuery = "";
  export let selectedGradeFilter = "ALL";
  export let selectedSubjectFilter = "ALL";
  export let selectedTestartFilter = "ALL";
  export let availableGrades: string[] = [];
  export let availableSubjects: string[] = [];
  export let testartOptions: { value: string; label: string; count: number }[] = [];
  export let totalExamCount = 0;
</script>

<div class="flex min-w-0 flex-col gap-4">
  <div>
    <TextInput
      type="text"
      placeholder={$t("dashboard.filterBar.searchPlaceholder")}
      bind:value={searchQuery}
    />
  </div>

  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
    {#if availableGrades.length > 0}
      <div class="flex min-w-0 flex-col gap-1 text-sm text-content">
        <label class="text-muted" for="dashboard-grade">{$t("dashboard.filterBar.gradeLabel")}</label>
        <Select id="dashboard-grade" bind:value={selectedGradeFilter}>
          <option value="ALL">{$t("dashboard.filterBar.allGrades")}</option>
          {#each availableGrades as g}
            <option value={g}>{$t("dashboard.filterBar.gradeOption", { grade: g })}</option>
          {/each}
        </Select>
      </div>
    {/if}

    {#if availableSubjects.length > 0}
      <div class="flex min-w-0 flex-col gap-1 text-sm text-content">
        <label class="text-muted" for="dashboard-subject">{$t("dashboard.filterBar.subjectLabel")}</label>
        <Select id="dashboard-subject" bind:value={selectedSubjectFilter}>
          <option value="ALL">{$t("dashboard.filterBar.allSubjects")}</option>
          {#each availableSubjects as s}
            <option value={s}>{s}</option>
          {/each}
        </Select>
      </div>
    {/if}
  </div>

  {#if testartOptions.length > 0}
    <FilterPills
      selected={selectedTestartFilter}
      allLabel={$t("dashboard.filterBar.allTestarts", { count: totalExamCount })}
      options={testartOptions}
      onSelect={(value) => (selectedTestartFilter = value)}
    />
  {/if}
</div>
