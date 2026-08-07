<script lang="ts">
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

<div class="filter-sidebar" class:collapsed={filterCollapsed}>
  <div class="search-box">
    <input
      type="text"
      placeholder="Search exercises by name, topic, grade, subject, or LaTeX content..."
      bind:value={searchQuery}
    />
  </div>

  <div class="filter-selects">
    {#if availableGrades.length > 0}
      <div class="select-group">
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
      <div class="select-group">
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

  <div class="topic-pills">
    <button
      class="pill"
      class:active={selectedTopic === "ALL"}
      on:click={() => onTopicChange("ALL")}
    >
      All Topics ({allGroups.length})
    </button>
    {#each availableTopics as topic}
      {@const groupCount = allGroups.filter((g) => g.topicTag === topic).length}
      <button
        class="pill"
        class:active={selectedTopic === topic}
        on:click={() => onTopicChange(topic)}
      >
        {topic} ({groupCount})
      </button>
    {/each}
  </div>
</div>

<style>
  .filter-sidebar {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    position: sticky;
    top: 0.5rem;
  }

  .search-box input {
    width: 100%;
    padding: 0.75rem;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    color: white;
    box-sizing: border-box;
  }

  .filter-selects {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
  }

  .select-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #cbd5e1;
    font-size: 0.875rem;
  }

  .select-group select {
    background: #1e293b;
    border: 1px solid #334155;
    color: white;
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    font-size: 0.85rem;
  }

  .topic-pills {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    width: 100%;
  }

  .pill {
    background: #1e293b;
    border: 1px solid #334155;
    color: #cbd5e1;
    padding: 0.375rem 0.75rem;
    border-radius: 16px;
    cursor: pointer;
    font-size: 0.85rem;
    width: 100%;
    text-align: left;
    box-sizing: border-box;
  }

  .pill.active {
    background: #0284c7;
    border-color: #38bdf8;
    color: white;
    font-weight: 600;
  }

  @media (max-width: 767px) {
    .filter-sidebar.collapsed {
      display: none;
    }
  }
</style>
