<script lang="ts">
  import type { ExamRecord, SubmissionRecord } from "#lib/db/schema";
  import { formatExamCourse } from "#lib/utils/examLabel";
  import { t } from "#lib/i18n";
  import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
  import { Badge, Button } from "#lib/components/ui";
  import InfoTip from "#lib/components/help/InfoTip.svelte";
  import { ensure64CharHex } from "#lib/crypto/hmac";
  import { untrack } from "svelte";

  interface Props {
    examId: string;
    exam: ExamRecord | null;
    currentIndex: number;
    submissionsLength: number;
    currentSub: SubmissionRecord | undefined;
    calculatedGrade: { grade: string; label: string } | null;
  }

  let {
    examId,
    exam,
    currentIndex,
    submissionsLength,
    currentSub,
    calculatedGrade
  }: Props = $props();

  // The raw pseudonymHash can be the QR text including the student's name (issue #80): never render it here, only its hash (the same value the server stores).
  let displayId = $state("");
  let idSeq = 0;

  $effect.pre(() => {
    const raw = currentSub?.pseudonymHash;
    untrack(() => {
      const seq = ++idSeq;
      displayId = "";
      if (!raw) return;
      ensure64CharHex(raw).then((hex) => {
        if (seq === idSeq) displayId = hex;
      });
    });
  });
</script>

<div
  class="z-10 flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line bg-surface-sunken px-3 py-1 lg:flex-nowrap lg:py-0"
>
  <div class="flex min-w-0 items-center gap-3">
    <Button
      href="/exam/{examId}"
      size="sm"
      variant="outlined"
      severity="secondary"
      icon={faArrowLeft}
      title={$t("grading.header.backToExamTitle")}
    >{$t("grading.header.backToExam")}</Button>
    <div class="flex min-w-0 items-center gap-2 overflow-hidden whitespace-nowrap">
      <h1 class="m-0 min-w-0 overflow-hidden text-ellipsis text-base font-semibold text-content">{exam?.title || $t("grading.header.examFallback")}</h1>
      <span class="text-xs text-muted">
        {exam?.testart || "Kurzarbeit"} • {$t("grading.header.classLabel")} {formatExamCourse(exam?.grade, exam?.klasse) || "-"} • {$t("grading.header.subjectLabel")} {exam?.fach || "-"}
      </span>
    </div>
  </div>

  <div class="flex min-w-0 items-center justify-center">
    <div class="flex items-center gap-2 rounded-full border border-line bg-surface-raised px-3 py-0.5 text-xs">
      <span class="font-semibold text-content">{$t("grading.header.anonymousStudent", { index: currentIndex + 1, total: submissionsLength })}</span>
      <InfoTip text={$t("help.tips.blindGrading")} topic="grading" />
      <span class="rounded-sm bg-surface-sunken px-1.5 py-0.5 font-mono text-xs text-muted" title={displayId}>
        {$t("grading.header.idPrefix")}{displayId.substring(0, 10)}...
      </span>
    </div>
  </div>

  <div class="flex flex-wrap items-center gap-2">
    {#if calculatedGrade}
      <Badge severity="info">
        {$t("grading.header.gradeLabel")}
        <strong class="mx-1 text-base">{calculatedGrade.grade}</strong>
        ({calculatedGrade.label})
      </Badge>
    {/if}
  </div>
</div>
