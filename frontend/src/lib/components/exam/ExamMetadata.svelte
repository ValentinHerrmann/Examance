<script lang="ts">
  import type { ExamRecord } from '$lib/db/schema';

  export let exam: ExamRecord | null;
  export let totalPoints: number;
  export let submissionsCount: number;
  export let studentsCount: number;
  export let gradedCount: number;
  export let storagePolicy: string;
</script>

{#if exam}
  <div class="exam-metadata">
    <h2>{exam.title}</h2>
    <div class="meta-grid">
      {#if exam.testart}<span>Art: {exam.testart}</span>{/if}
      {#if exam.klasse}<span>Klasse: {exam.klasse}</span>{/if}
      {#if exam.fach}<span>Fach: {exam.fach}</span>{/if}
      {#if exam.lehrernachname}<span>Lehrer: {exam.lehrernachname}</span>{/if}
      {#if exam.datum}<span>Datum: {exam.datum}</span>{/if}
      <span>Punkte: {totalPoints}</span>
      <span>Abgaben: {submissionsCount}</span>
      <span>Schüler: {studentsCount}</span>
      <span>Korrigiert: {gradedCount}</span>
      {#if exam.gradingKey}
        <span>
          Note: {exam.gradingKey.preset === 'linear_50' ? 'Linear (50%)' : exam.gradingKey.preset === 'linear_40' ? 'Linear (40%)' : exam.gradingKey.preset === 'even_split' ? 'Gleichmäßig' : 'Benutzerdefiniert'}
        </span>
      {/if}
    </div>
  </div>

  {#if storagePolicy === 'all-local'}
    <div class="local-banner">
      <span>💾 Lokal gespeichert — Synchronisieren mit Server für Export & Statistik</span>
    </div>
  {/if}
{/if}

<style>
  .exam-metadata {
    margin-bottom: 1.5rem;
  }

  h2 {
    color: #38bdf8;
    margin-bottom: 0.75rem;
  }

  .meta-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    color: #94a3b8;
    font-size: 0.9rem;
  }

  .local-banner {
    background: #1e293b;
    border: 1px solid #f59e0b;
    border-radius: 6px;
    padding: 0.75rem 1rem;
    color: #fbbf24;
    font-size: 0.85rem;
    margin-bottom: 1.5rem;
  }
</style>
