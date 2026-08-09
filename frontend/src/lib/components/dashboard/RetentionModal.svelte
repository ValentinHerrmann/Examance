<script lang="ts">
  import type { ExamRecord } from '$lib/db/schema';
  import type { RetentionCheckResult } from '$lib/gdpr/retention';

  export let expiredExam: { exam: ExamRecord; check: RetentionCheckResult };
  export let onExtend: () => void;
  export let onDelete: () => void;
</script>

<div class="fixed inset-0 z-[100] flex items-center justify-center bg-black/75">
  <div class="max-w-[480px] rounded-xl border border-yellow-500 bg-slate-800 p-8">
    <h3 class="mt-0 text-yellow-200">GDPR Retention Warning (Art. 5)</h3>
    <p>
      Exam <strong>{expiredExam.exam.title}</strong> passed its retention period on
      <strong>{expiredExam.exam.retentionUntil}</strong> ({Math.abs(expiredExam.check.daysRemaining)} days ago).
    </p>
    <p>Would you like to extend retention by 1 year or permanently delete local project data?</p>
    <div class="mt-6 flex gap-4">
      <button class="cursor-pointer rounded-md border-none bg-red-500 px-5 py-2.5 font-semibold text-white" on:click={onDelete}>Delete Data</button>
      <button class="cursor-pointer rounded-md border-none bg-sky-600 px-5 py-2.5 font-semibold text-white" on:click={onExtend}>Extend Retention (+1 Year)</button>
    </div>
  </div>
</div>
