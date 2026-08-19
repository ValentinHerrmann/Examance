<script lang="ts">
  import type { ExamRecord } from '$lib/db/schema';
  import type { RetentionCheckResult } from '$lib/gdpr/retention';
  import { t } from "$lib/i18n";

  export let expiredExam: { exam: ExamRecord; check: RetentionCheckResult };
  export let onExtend: () => void;
  export let onDelete: () => void;
</script>

<div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/75">
  <div class="max-w-[480px] rounded-xl border border-yellow-500 bg-slate-800 p-8">
    <h3 class="mt-0 text-yellow-200">{$t("dashboard.retentionModal.title")}</h3>
    <p>
      {$t("dashboard.retentionModal.examLabel")} <strong>{expiredExam.exam.title}</strong>
      {$t("dashboard.retentionModal.passedOn")}
      <strong>{expiredExam.exam.retentionUntil}</strong>
      ({$t("dashboard.retentionModal.daysAgo", { days: Math.abs(expiredExam.check.daysRemaining) })}).
    </p>
    <p>{$t("dashboard.retentionModal.question")}</p>
    <div class="mt-6 flex gap-4">
      <button class="cursor-pointer rounded-md border-none bg-red-500 px-5 py-2.5 font-semibold text-white" on:click={onDelete}>{$t("dashboard.retentionModal.deleteData")}</button>
      <button class="cursor-pointer rounded-md border-none bg-sky-600 px-5 py-2.5 font-semibold text-white" on:click={onExtend}>{$t("dashboard.retentionModal.extendRetention")}</button>
    </div>
  </div>
</div>
