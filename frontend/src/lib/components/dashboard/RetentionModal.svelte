<script lang="ts">
  import type { ExamRecord } from '$lib/db/schema';
  import type { RetentionCheckResult } from '$lib/gdpr/retention';
  import { t } from "$lib/i18n";
  import { Modal, Button } from "$lib/components/ui";

  export let expiredExam: { exam: ExamRecord; check: RetentionCheckResult };
  export let onExtend: () => void;
  export let onDelete: () => void;
</script>

<Modal
  open={true}
  size="sm"
  title={$t("dashboard.retentionModal.title")}
  closeOnBackdrop={false}
  closeOnEscape={false}
>
  <p>
    {$t("dashboard.retentionModal.examLabel")} <strong>{expiredExam.exam.title}</strong>
    {$t("dashboard.retentionModal.passedOn")}
    <strong>{expiredExam.exam.retentionUntil}</strong>
    ({$t("dashboard.retentionModal.daysAgo", { days: Math.abs(expiredExam.check.daysRemaining) })}).
  </p>
  <p>{$t("dashboard.retentionModal.question")}</p>

  <svelte:fragment slot="footer">
    <Button variant="danger" onClick={onDelete}>{$t("dashboard.retentionModal.deleteData")}</Button>
    <Button variant="primary" onClick={onExtend}>{$t("dashboard.retentionModal.extendRetention")}</Button>
  </svelte:fragment>
</Modal>
