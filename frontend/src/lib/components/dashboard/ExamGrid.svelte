<script lang="ts">
  import type { ExamRecord } from '$lib/db/schema';

  export let exams: ExamRecord[];
  export let examStatsMap: Map<string, { avgScore: number | null; count: number }>;
  export let onNavigate: (id: string) => void;
  export let onDelete: (id: string, title?: string) => void;
</script>

{#if exams.length === 0}
  <div class="empty-state">
    <p>No exams match your search or filter criteria.</p>
  </div>
{:else}
  <div class="exams-grid">
    {#each exams as exam}
      {@const stats = examStatsMap.get(exam.id)}
      <div
        class="exam-card clickable-card"
        role="button"
        tabindex="0"
        on:click={() => onNavigate(exam.id)}
        on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(exam.id); } }}
      >
        <h3>{exam.title || 'Untitled Exam'}</h3>
        <div class="exam-tags">
          {#if exam.klasse}
            <span class="exam-tag grade-tag">Klasse {exam.klasse}</span>
          {/if}
          {#if exam.fach}
            <span class="exam-tag subject-tag">{exam.fach}</span>
          {/if}
          {#if exam.testart}
            <span class="exam-tag testart-tag">{exam.testart}</span>
          {/if}
          {#if stats?.avgScore !== undefined && stats.avgScore !== null}
            <span class="exam-tag avg-grade-tag">Ø {stats.avgScore} Pkt</span>
          {/if}
        </div>
        {#if exam.datum}
          <p class="date">Datum: {exam.datum}</p>
        {:else if exam.createdAt}
          <p class="date">Datum: {new Date(exam.createdAt).toLocaleDateString()}</p>
        {/if}
        {#if exam.retentionUntil}
          <p class="retention-info">Retention until: {exam.retentionUntil}</p>
        {/if}
        <div class="actions">
          <a href="/exam/{exam.id}" on:click|stopPropagation>Open Exam</a>
          <button class="card-delete-btn" on:click|stopPropagation={() => onDelete(exam.id, exam.title)}>Delete</button>
        </div>
      </div>
    {/each}
  </div>
{/if}

<style>
  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    background: #1e293b;
    border-radius: 12px;
    border: 1px dashed #334155;
  }

  .empty-state p {
    font-size: 1.125rem;
    color: #94a3b8;
  }

  .exam-tags {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    margin-bottom: 0.75rem;
  }

  .exam-tag {
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 4px;
  }

  .grade-tag {
    background: #1e1b4b;
    color: #c7d2fe;
    border: 1px solid #4338ca;
  }

  .subject-tag {
    background: #064e3b;
    color: #a7f3d0;
    border: 1px solid #047857;
  }

  .testart-tag {
    background: #334155;
    color: #e2e8f0;
  }

  .avg-grade-tag {
    background: #0284c7;
    color: #e0f2fe;
    font-weight: 600;
  }

  .exams-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 1.5rem;
  }

  .exam-card {
    background: #1e293b;
    padding: 1.5rem;
    border-radius: 8px;
    border: 1px solid #334155;
  }

  .exam-card.clickable-card {
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .exam-card.clickable-card:hover {
    border-color: #38bdf8;
    background: #24334a;
  }

  .exam-card h3 {
    margin: 0 0 0.5rem 0;
    color: #38bdf8;
  }

  .exam-card .date {
    font-size: 0.875rem;
    color: #cbd5e1;
    margin-bottom: 0.25rem;
  }

  .exam-card .retention-info {
    font-size: 0.75rem;
    color: #64748b;
    margin-bottom: 1rem;
  }

  .exam-card .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .exam-card .actions a {
    color: #38bdf8;
    text-decoration: none;
    font-weight: 500;
  }

  .card-delete-btn {
    background: transparent;
    color: #ef4444;
    border: 1px solid #ef4444;
    padding: 0.25rem 0.625rem;
    border-radius: 4px;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .card-delete-btn:hover {
    background: #ef4444;
    color: white;
  }
</style>
