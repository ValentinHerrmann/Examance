<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import { t } from "$lib/i18n";
  import { FilterPills, TextInput, Select } from "$lib/components/ui";

  interface ExerciseGroup {
    groupId: string;
    name: string;
    topicTag: string;
    grade?: string;
    subject?: string;
    maxPoints: number;
    minPoints: number;
    variants: Map<string, unknown>;
    allMembers: unknown[];
  }

  export let searchQuery = "";
  export let selectedGrade = "ALL";
  export let selectedSubject = "ALL";
  export let selectedTopic = "ALL";
  export let availableTopics: string[] = [];
  export let availableGrades: string[] = [];
  export let availableSubjects: string[] = [];
  export let allGroups: ExerciseGroup[] = [];
  export let onTopicChange: (topic: string) => void;

  $: topicPillOptions = availableTopics.map((topic) => ({
    value: topic,
    label: topic,
    count: allGroups.filter((g) => g.topicTag === topic).length,
  }));
</script>

<div class="flex min-w-0 flex-col gap-4">
  <div>
    <TextInput
      type="text"
      placeholder={$t("exercises.filterSidebar.searchPlaceholder")}
      bind:value={searchQuery}
    />
  </div>

  <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
    {#if availableGrades.length > 0}
      <div class="flex min-w-0 flex-col gap-1 text-sm text-content">
        <label class="text-muted" for="grade-select">{$t("exercises.filterSidebar.gradeLabel")}</label>
        <Select id="grade-select" bind:value={selectedGrade}>
          <option value="ALL">{$t("exercises.filterSidebar.allGrades")}</option>
          {#each availableGrades as g}
            <option value={g}>{$t("exercises.filterSidebar.gradeOption", { grade: g })}</option>
          {/each}
        </Select>
      </div>
    {/if}

    {#if availableSubjects.length > 0}
      <div class="flex min-w-0 flex-col gap-1 text-sm text-content">
        <label class="text-muted" for="subject-select">{$t("exercises.filterSidebar.subjectLabel")}</label>
        <Select id="subject-select" bind:value={selectedSubject}>
          <option value="ALL">{$t("exercises.filterSidebar.allSubjects")}</option>
          {#each availableSubjects as s}
            <option value={s}>{s}</option>
          {/each}
        </Select>
      </div>
    {/if}
  </div>

  <FilterPills
    selected={selectedTopic}
    allLabel={$t("exercises.filterSidebar.allTopics", { count: allGroups.length })}
    options={topicPillOptions}
    onSelect={onTopicChange}
  />
</div>

