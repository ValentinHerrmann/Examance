<script lang="ts">
  import './ExamGrid.css';

  import type { ExamRecord } from '$lib/db/schema';

  export let exams: ExamRecord[];
  export let examStatsMap: Map<string, { avgScore: number | null; count: number }>;
  export let onNavigate: (id: string) => void;
  export let onDelete: (id: string, title?: string) => void;
</script>

{#if exams.length === 0}
  <div class="exam-grid-empty-state">
    <p>No exams match your search or filter criteria.</p>
  </div>
{:else}
  <div class="exam-grid-exams-grid">
    {#each exams as exam}
      {@const stats = examStatsMap.get(exam.id)}
      <div
        class="exam-grid-exam-card exam-grid-clickable-card"
        role="button"
        tabindex="0"
        on:click={() => onNavigate(exam.id)}
        on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(exam.id); } }}
      >
        <h3>{exam.title || 'Untitled Exam'}</h3>
        <div class="exam-grid-exam-tags">
          {#if exam.klasse}
            <span class="exam-grid-exam-tag exam-grid-grade-tag">Klasse {exam.klasse}</span>
          {/if}
          {#if exam.fach}
            <span class="exam-grid-exam-tag exam-grid-subject-tag">{exam.fach}</span>
          {/if}
          {#if exam.testart}
            <span class="exam-grid-exam-tag exam-grid-testart-tag">{exam.testart}</span>
          {/if}
          {#if stats?.avgScore !== undefined && stats.avgScore !== null}
            <span class="exam-grid-exam-tag exam-grid-avg-grade-tag">Ø {stats.avgScore} Pkt</span>
          {/if}
        </div>
        {#if exam.datum}
          <p class="exam-grid-date">Datum: {exam.datum}</p>
        {:else if exam.createdAt}
          <p class="exam-grid-date">Datum: {new Date(exam.createdAt).toLocaleDateString()}</p>
        {/if}
        {#if exam.retentionUntil}
          <p class="exam-grid-retention-info">Retention until: {exam.retentionUntil}</p>
        {/if}
        <div class="exam-grid-actions">
          <a href="/exam/{exam.id}" on:click|stopPropagation>Open Exam</a>
          <button class="exam-grid-card-delete-btn" on:click|stopPropagation={() => onDelete(exam.id, exam.title)}>Delete</button>
        </div>
      </div>
    {/each}
  </div>
{/if}
