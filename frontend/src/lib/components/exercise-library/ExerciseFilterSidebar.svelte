<script lang="ts">
  import type { ExerciseRecord } from "$lib/db/schema";
  import { t } from "$lib/i18n";
  import { controlClass } from "$lib/components/ui";

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

  /* Topic pills wrap into rows when the panel is wide (drawer / stacked) and
   * stack into a column in the desktop sidebar. */
  const pillBase =
    "box-border min-h-9 cursor-pointer rounded-2xl border border-line bg-surface-raised px-3 py-1.5 text-left text-sm text-slate-300 hover:border-line-strong";
  const pillActive =
    "box-border min-h-9 cursor-pointer rounded-2xl border border-accent bg-accent-strong px-3 py-1.5 text-left text-sm font-semibold text-white";
</script>

<div class="flex min-w-0 flex-col gap-4">
  <div>
    <input
      type="text"
      placeholder={$t("exercises.filterSidebar.searchPlaceholder")}
      bind:value={searchQuery}
      class={controlClass}
    />
  </div>

  <div class="flex flex-wrap gap-3 sm:gap-6">
    {#if availableGrades.length > 0}
      <div class="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-300">
        <label class="shrink-0" for="grade-select">{$t("exercises.filterSidebar.gradeLabel")}</label>
        <select
          id="grade-select"
          bind:value={selectedGrade}
          class={controlClass}
        >
          <option value="ALL">{$t("exercises.filterSidebar.allGrades")}</option>
          {#each availableGrades as g}
            <option value={g}>{$t("exercises.filterSidebar.gradeOption", { grade: g })}</option>
          {/each}
        </select>
      </div>
    {/if}

    {#if availableSubjects.length > 0}
      <div class="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-300">
        <label class="shrink-0" for="subject-select">{$t("exercises.filterSidebar.subjectLabel")}</label>
        <select
          id="subject-select"
          bind:value={selectedSubject}
          class={controlClass}
        >
          <option value="ALL">{$t("exercises.filterSidebar.allSubjects")}</option>
          {#each availableSubjects as s}
            <option value={s}>{s}</option>
          {/each}
        </select>
      </div>
    {/if}
  </div>

  <div class="flex w-full flex-row flex-wrap gap-1.5 lg:flex-col lg:flex-nowrap">
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

