<script lang="ts">
  import type { ExamRecord } from '#lib/db/schema';
  import type { RetentionCheckResult } from '#lib/gdpr/retention';
  import { t } from "#lib/i18n";
  import { Modal, Button } from "#lib/components/ui";

  interface Props {
    expiredExam: { exam: ExamRecord; check: RetentionCheckResult };
    onExtend: () => void;
    onDelete: () => void;
  }

  let { expiredExam, onExtend, onDelete }: Props = $props();
</script>

<Modal
  open={true}
  size="small"
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

  {#snippet footer()}
    <Button severity="danger" onClick={onDelete}>{$t("dashboard.retentionModal.deleteData")}</Button>
    <Button onClick={onExtend}>{$t("dashboard.retentionModal.extendRetention")}</Button>
  {/snippet}
</Modal>
