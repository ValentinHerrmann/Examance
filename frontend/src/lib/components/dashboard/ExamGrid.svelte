<script lang="ts">
  import type { ExamRecord } from '$lib/db/schema';
  import { formatExamCourse } from '$lib/utils/examLabel';

  export let exams: ExamRecord[];
  export let examStatsMap: Map<string, { avgScore: number | null; count: number }>;
  export let onNavigate: (id: string) => void;
  export let onDelete: (id: string, title?: string) => void;
</script>

{#if exams.length === 0}
  <div class="rounded-xl border border-dashed border-slate-700 bg-slate-800 px-8 py-16 text-center">
    <p class="text-lg text-slate-400">No exams match your search or filter criteria.</p>
  </div>
{:else}
  <div class="grid gap-6" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));">
    {#each exams as exam}
      {@const stats = examStatsMap.get(exam.id)}
      {@const courseLabel = formatExamCourse(exam.grade, exam.klasse)}
      <div
        class="cursor-pointer rounded-lg border border-slate-700 bg-slate-800 p-6 transition-colors duration-150 ease-in-out hover:border-sky-400 hover:bg-slate-700"
        role="button"
        tabindex="0"
        on:click={() => onNavigate(exam.id)}
        on:keydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onNavigate(exam.id); } }}
      >
        <h3 class="m-0 mb-2 text-sky-400">{exam.title || 'Untitled Exam'}</h3>
        <div class="mb-3 flex flex-wrap gap-1.5">
          {#if courseLabel}
            <span class="rounded border border-indigo-700 bg-indigo-950 px-2 py-0.5 text-xs text-indigo-200"
              >Klasse {courseLabel}</span
            >
          {/if}
          {#if exam.fach}
            <span class="rounded border border-emerald-700 bg-emerald-900 px-2 py-0.5 text-xs text-emerald-200"
              >{exam.fach}</span
            >
          {/if}
          {#if exam.testart}
            <span class="rounded bg-slate-700 px-2 py-0.5 text-xs text-slate-200">{exam.testart}</span>
          {/if}
          {#if stats?.avgScore !== undefined && stats.avgScore !== null}
            <span class="rounded bg-sky-600 px-2 py-0.5 text-xs font-semibold text-sky-100">Ø {stats.avgScore} Pkt</span>
          {/if}
        </div>
        {#if exam.datum}
          <p class="mb-1 text-sm text-slate-300">Datum: {exam.datum}</p>
        {:else if exam.createdAt}
          <p class="mb-1 text-sm text-slate-300">Datum: {new Date(exam.createdAt).toLocaleDateString()}</p>
        {/if}
        {#if exam.retentionUntil}
          <p class="mb-4 text-xs text-slate-500">Retention until: {exam.retentionUntil}</p>
        {/if}
        <div class="flex items-center justify-between">
          <a href="/exam/{exam.id}" class="font-medium text-sky-400 no-underline" on:click|stopPropagation>Open Exam</a>
          <button
            class="rounded border border-red-500 bg-transparent px-2.5 py-1 text-[0.8rem] text-red-500 hover:bg-red-500 hover:text-white"
            on:click|stopPropagation={() => onDelete(exam.id, exam.title)}>Delete</button
          >
        </div>
      </div>
    {/each}
  </div>
{/if}
