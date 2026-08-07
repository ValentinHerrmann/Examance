<script lang="ts">
  import './RetentionModal.css';

  import type { ExamRecord } from '$lib/db/schema';
  import type { RetentionCheckResult } from '$lib/gdpr/retention';

  export let expiredExam: { exam: ExamRecord; check: RetentionCheckResult };
  export let onExtend: () => void;
  export let onDelete: () => void;
</script>

<div class="retention-modal-modal-overlay">
  <div class="retention-modal-modal-card">
    <h3>GDPR Retention Warning (Art. 5)</h3>
    <p>
      Exam <strong>{expiredExam.exam.title}</strong> passed its retention period on
      <strong>{expiredExam.exam.retentionUntil}</strong> ({Math.abs(expiredExam.check.daysRemaining)} days ago).
    </p>
    <p>Would you like to extend retention by 1 year or permanently delete local project data?</p>
    <div class="retention-modal-modal-actions">
      <button class="retention-modal-delete-btn" on:click={onDelete}>Delete Data</button>
      <button class="retention-modal-extend-btn" on:click={onExtend}>Extend Retention (+1 Year)</button>
    </div>
  </div>
</div>
