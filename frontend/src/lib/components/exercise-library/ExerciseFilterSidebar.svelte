<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import { t } from "$lib/i18n";

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
  export let filterCollapsed = true;
  export let availableTopics: string[] = [];
  export let availableGrades: string[] = [];
  export let availableSubjects: string[] = [];
  export let allGroups: ExerciseGroup[] = [];
  export let onTopicChange: (topic: string) => void;

  const pillBase =
    "w-full box-border rounded-2xl border border-slate-700 bg-slate-800 px-3 py-[0.375rem] text-left text-[0.85rem] text-slate-300 cursor-pointer";
  const pillActive =
    "w-full box-border rounded-2xl border border-sky-400 bg-sky-600 px-3 py-[0.375rem] text-left text-[0.85rem] font-semibold text-white cursor-pointer";
</script>

<div class="flex flex-col gap-4 sticky top-2 {filterCollapsed ? 'max-md:hidden' : ''}">
  <div>
    <input
      type="text"
      placeholder={$t("exercises.filterSidebar.searchPlaceholder")}
      bind:value={searchQuery}
      class="box-border w-full rounded-lg border border-slate-700 bg-slate-800 p-3 text-white"
    />
  </div>

  <div class="flex flex-wrap gap-6">
    {#if availableGrades.length > 0}
      <div class="flex items-center gap-2 text-sm text-slate-300">
        <label for="grade-select">{$t("exercises.filterSidebar.gradeLabel")}</label>
        <select
          id="grade-select"
          bind:value={selectedGrade}
          class="rounded-md border border-slate-700 bg-slate-800 px-3 py-[0.375rem] text-[0.85rem] text-white"
        >
          <option value="ALL">{$t("exercises.filterSidebar.allGrades")}</option>
          {#each availableGrades as g}
            <option value={g}>{$t("exercises.filterSidebar.gradeOption", { grade: g })}</option>
          {/each}
        </select>
      </div>
    {/if}

    {#if availableSubjects.length > 0}
      <div class="flex items-center gap-2 text-sm text-slate-300">
        <label for="subject-select">{$t("exercises.filterSidebar.subjectLabel")}</label>
        <select
          id="subject-select"
          bind:value={selectedSubject}
          class="rounded-md border border-slate-700 bg-slate-800 px-3 py-[0.375rem] text-[0.85rem] text-white"
        >
          <option value="ALL">{$t("exercises.filterSidebar.allSubjects")}</option>
          {#each availableSubjects as s}
            <option value={s}>{s}</option>
          {/each}
        </select>
      </div>
    {/if}
  </div>

  <div class="flex w-full flex-col gap-[0.375rem]">
    <button
      class={selectedTopic === "ALL" ? pillActive : pillBase}
      on:click={() => onTopicChange("ALL")}
    >
      {$t("exercises.filterSidebar.allTopics", { count: allGroups.length })}
    </button>
    {#each availableTopics as topic}
      {@const groupCount = allGroups.filter((g) => g.topicTag === topic).length}
      <button
        class={selectedTopic === topic ? pillActive : pillBase}
        on:click={() => onTopicChange(topic)}
      >
        {topic} ({groupCount})
      </button>
    {/each}
  </div>
</div>

