<script lang="ts">
  import "./ExamMetadata.css";
  import type { ExamRecord } from '$lib/db/schema';
  import { formatExamCourse } from '$lib/utils/examLabel';

  export let exam: ExamRecord | null;
  export let totalPoints: number;
  export let submissionsCount: number;
  export let studentsCount: number;
  export let gradedCount: number;
  export let storagePolicy: string;

  $: courseLabel = exam ? formatExamCourse(exam.grade, exam.klasse) : '';
</script>

{#if exam}
  <div class="exam-metadata">
    <h2>{exam.title}</h2>
    <div class="emd-meta-grid">
      {#if exam.testart}<span>Art: {exam.testart}</span>{/if}
      {#if courseLabel}<span>Klasse: {courseLabel}</span>{/if}
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
    <div class="emd-local-banner">
      <span>💾 Lokal gespeichert — Synchronisieren mit Server für Export & Statistik</span>
    </div>
  {/if}
{/if}
