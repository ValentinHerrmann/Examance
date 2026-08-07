<script lang="ts">
  import "./ExerciseFilterSidebar.css";
  import type { ExerciseRecord } from "$lib/db/schema";

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
</script>

<div class="exercise-filter-sidebar-filter-sidebar" class:collapsed={filterCollapsed}>
  <div class="exercise-filter-sidebar-search-box">
    <input
      type="text"
      placeholder="Search exercises by name, topic, grade, subject, or LaTeX content..."
      bind:value={searchQuery}
    />
  </div>

  <div class="exercise-filter-sidebar-filter-selects">
    {#if availableGrades.length > 0}
      <div class="exercise-filter-sidebar-select-group">
        <label for="grade-select">Grade:</label>
        <select id="grade-select" bind:value={selectedGrade}>
          <option value="ALL">All Grades</option>
          {#each availableGrades as g}
            <option value={g}>Grade {g}</option>
          {/each}
        </select>
      </div>
    {/if}

    {#if availableSubjects.length > 0}
      <div class="exercise-filter-sidebar-select-group">
        <label for="subject-select">Subject:</label>
        <select id="subject-select" bind:value={selectedSubject}>
          <option value="ALL">All Subjects</option>
          {#each availableSubjects as s}
            <option value={s}>{s}</option>
          {/each}
        </select>
      </div>
    {/if}
  </div>

  <div class="exercise-filter-sidebar-topic-pills">
    <button
      class="exercise-filter-sidebar-pill"
      class:active={selectedTopic === "ALL"}
      on:click={() => onTopicChange("ALL")}
    >
      All Topics ({allGroups.length})
    </button>
    {#each availableTopics as topic}
      {@const groupCount = allGroups.filter((g) => g.topicTag === topic).length}
      <button
        class="exercise-filter-sidebar-pill"
        class:active={selectedTopic === topic}
        on:click={() => onTopicChange(topic)}
      >
        {topic} ({groupCount})
      </button>
    {/each}
  </div>
</div>

