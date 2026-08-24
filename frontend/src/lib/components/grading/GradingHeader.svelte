<script lang="ts">
  import type { ExamRecord, SubmissionRecord } from "$lib/db/schema";
  import { formatExamCourse } from "$lib/utils/examLabel";
  import { t } from "$lib/i18n";

  export let examId: string;
  export let exam: ExamRecord | null;
  export let currentIndex: number;
  export let submissionsLength: number;
  export let currentSub: SubmissionRecord | undefined;
  export let calculatedGrade: { grade: string; label: string } | null;
</script>

<div
  class="z-10 flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-slate-800 bg-slate-900 px-3 py-1 lg:flex-nowrap lg:py-0"
>
  <div class="flex min-w-0 items-center gap-3">
    <a
      href="/exam/{examId}"
      class="whitespace-nowrap rounded-md border border-slate-700 bg-slate-800 px-[0.6rem] py-1 text-[0.8rem] font-medium text-slate-400 no-underline transition-all duration-150 ease-[ease] hover:border-sky-400 hover:bg-slate-700 hover:text-sky-400"
      title={$t("grading.header.backToExamTitle")}
    >{$t("grading.header.backToExam")}</a>
    <div class="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap">
      <span class="overflow-hidden text-ellipsis text-[0.95rem] font-bold text-sky-400">{exam?.title || $t("grading.header.examFallback")}</span>
      <span class="text-xs text-slate-500">
        {exam?.testart || "Kurzarbeit"} • {$t("grading.header.classLabel")} {formatExamCourse(exam?.grade, exam?.klasse) || "-"} • {$t("grading.header.subjectLabel")} {exam?.fach || "-"}
      </span>
    </div>
  </div>

  <div class="flex min-w-0 items-center justify-center">
    <div class="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-[0.65rem] py-[0.2rem] text-[0.8rem]">
      <span class="font-semibold text-slate-100">{$t("grading.header.anonymousStudent", { index: currentIndex + 1, total: submissionsLength })}</span>
      <span class="rounded bg-slate-900 px-[0.4rem] py-[0.1rem] font-mono text-[0.725rem] text-slate-400" title={currentSub?.pseudonymHash}>
        {$t("grading.header.idPrefix")}{currentSub?.pseudonymHash ? currentSub.pseudonymHash.substring(0, 10) : ''}...
      </span>
    </div>
  </div>

  <div class="flex flex-wrap items-center gap-2">
    {#if calculatedGrade}
      <div class="flex items-center gap-[0.35rem] rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-[0.65rem] py-[0.2rem] text-[0.8rem]">
        <span class="text-xs text-indigo-400">{$t("grading.header.gradeLabel")}</span>
        <span class="text-[0.95rem] font-bold text-indigo-100">{calculatedGrade.grade}</span>
        <span class="text-[0.725rem] text-indigo-300">({calculatedGrade.label})</span>
      </div>
    {/if}
  </div>
</div>
