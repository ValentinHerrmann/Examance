<script module lang="ts">
  let nextId = 0;
</script>

<script lang="ts">
  import { t } from "#lib/i18n";
  import { FilterPills, Select, TextInput } from "#lib/components/ui";

  /**
   * Filter panel shared by the exam and exercise overviews (search, grade/subject selects, category pills).
   * The topic select shows only with `topicOptions` (the exercise overview filters topics by pills instead).
   * Mounted in both the desktop sidebar and the phone drawer, so select ids are unique per instance.
   */
  interface Props {
    searchQuery?: string;
    searchPlaceholder: string;
    selectedGrade?: string;
    selectedSubject?: string;
    selectedTopic?: string;
    gradeOptions?: string[];
    subjectOptions?: string[];
    topicOptions?: string[];
    pillOptions?: { value: string; label: string; count: number }[];
    pillSelected?: string;
    pillAllLabel: string;
    onPillSelect: (value: string) => void;
  }

  let {
    searchQuery = $bindable(""),
    searchPlaceholder,
    selectedGrade = $bindable("ALL"),
    selectedSubject = $bindable("ALL"),
    selectedTopic = $bindable("ALL"),
    gradeOptions = [],
    subjectOptions = [],
    topicOptions = [],
    pillOptions = [],
    pillSelected = "ALL",
    pillAllLabel,
    onPillSelect,
  }: Props = $props();

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

    {#if topicOptions.length > 0}
      <div class="flex min-w-0 flex-col gap-1 text-sm text-content sm:col-span-2 lg:col-span-1 xl:col-span-2">
        <label class="text-muted" for="{id}-topic">{$t("common.filters.topic")}</label>
        <Select id="{id}-topic" bind:value={selectedTopic}>
          <option value="ALL">{$t("common.filters.allTopics")}</option>
          {#each topicOptions as topic}
            <option value={topic}>{topic}</option>
          {/each}
        </Select>
      </div>
    {/if}
  </div>

  {#if pillOptions.length > 0}
    <FilterPills selected={pillSelected} allLabel={pillAllLabel} options={pillOptions} onSelect={onPillSelect} />
  {/if}
</div>
