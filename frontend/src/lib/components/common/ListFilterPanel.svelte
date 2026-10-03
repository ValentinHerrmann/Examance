<script context="module" lang="ts">
  let nextId = 0;
</script>

<script lang="ts">
  import { t } from "$lib/i18n";
  import { FilterPills, Select, TextInput } from "$lib/components/ui";

  /**
   * The filter panel shared by the exam and exercise overviews: search, grade
   * and subject selects, and one row of category pills (exam type / topic).
   * Mounted once in the desktop sidebar and once in the phone drawer, so the
   * select ids are made unique per instance.
   */
  export let searchQuery = "";
  export let searchPlaceholder: string;
  export let selectedGrade = "ALL";
  export let selectedSubject = "ALL";
  export let gradeOptions: string[] = [];
  export let subjectOptions: string[] = [];
  export let pillOptions: { value: string; label: string; count: number }[] = [];
  export let pillSelected = "ALL";
  export let pillAllLabel: string;
  export let onPillSelect: (value: string) => void;

  const id = `list-filter-${nextId++}`;
</script>

<div class="flex min-w-0 flex-col gap-4">
  <TextInput type="text" placeholder={searchPlaceholder} bind:value={searchQuery} />

  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
    {#if gradeOptions.length > 0}
      <div class="flex min-w-0 flex-col gap-1 text-sm text-content">
        <label class="text-muted" for="{id}-grade">{$t("common.filters.grade")}</label>
        <Select id="{id}-grade" bind:value={selectedGrade}>
          <option value="ALL">{$t("common.filters.allGrades")}</option>
          {#each gradeOptions as g}
            <option value={g}>{$t("common.filters.gradeOption", { grade: g })}</option>
          {/each}
        </Select>
      </div>
    {/if}

    {#if subjectOptions.length > 0}
      <div class="flex min-w-0 flex-col gap-1 text-sm text-content">
        <label class="text-muted" for="{id}-subject">{$t("common.filters.subject")}</label>
        <Select id="{id}-subject" bind:value={selectedSubject}>
          <option value="ALL">{$t("common.filters.allSubjects")}</option>
          {#each subjectOptions as s}
            <option value={s}>{s}</option>
          {/each}
        </Select>
      </div>
    {/if}
  </div>

  {#if pillOptions.length > 0}
    <FilterPills selected={pillSelected} allLabel={pillAllLabel} options={pillOptions} onSelect={onPillSelect} />
  {/if}
</div>
