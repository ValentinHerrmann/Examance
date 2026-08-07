<script lang="ts">
  import type { ExamRecord } from '$lib/db/schema';
  import type { RetentionCheckResult } from '$lib/gdpr/retention';

  export let expiredExam: { exam: ExamRecord; check: RetentionCheckResult };
  export let onExtend: () => void;
  export let onDelete: () => void;
</script>

<div class="modal-overlay">
  <div class="modal-card">
    <h3>GDPR Retention Warning (Art. 5)</h3>
    <p>
      Exam <strong>{expiredExam.exam.title}</strong> passed its retention period on
      <strong>{expiredExam.exam.retentionUntil}</strong> ({Math.abs(expiredExam.check.daysRemaining)} days ago).
    </p>
    <p>Would you like to extend retention by 1 year or permanently delete local project data?</p>
    <div class="modal-actions">
      <button class="delete-btn" on:click={onDelete}>Delete Data</button>
      <button class="extend-btn" on:click={onExtend}>Extend Retention (+1 Year)</button>
    </div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.75);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 100;
  }

  .modal-card {
    background: #1e293b;
    border: 1px solid #eab308;
    padding: 2rem;
    border-radius: 12px;
    max-width: 480px;
  }

  .modal-card h3 {
    margin-top: 0;
    color: #fef08a;
  }

  .modal-actions {
    display: flex;
    gap: 1rem;
    margin-top: 1.5rem;
  }

  .delete-btn {
    background: #ef4444;
    color: white;
    border: none;
    padding: 0.625rem 1.25rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
  }

  .extend-btn {
    background: #0284c7;
    color: white;
    border: none;
    padding: 0.625rem 1.25rem;
    border-radius: 6px;
    font-weight: 600;
    cursor: pointer;
  }
</style>
