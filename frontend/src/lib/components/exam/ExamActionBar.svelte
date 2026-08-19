<script lang="ts">
  import "./ExamActionBar.css";
  import { t } from "$lib/i18n";
  export let examId: string;
  export let onEdit: () => void;
  export let onDelete: () => void;
  export let onExport: () => void;
  export let onScan: () => void;
  export let onGrade: () => void;
  export let onStats: () => void;
  export let onAddExercises: () => void;
  export let onDeleteAllSubmissions: () => void;
  export let storagePolicy: string;
</script>

<div class="exam-actions">
  <div class="actions-left">
    <button class="eab-btn eab-primary" on:click={onAddExercises}>
      {$t("exam.actionBar.addExercises")}
    </button>
    {#if storagePolicy === 'all-local'}
      <button class="eab-btn eab-secondary" on:click={onScan}>
        {$t("exam.actionBar.scan")}
      </button>
    {/if}
  </div>

  <div class="actions-right">
    <button class="eab-btn eab-secondary" on:click={onGrade}>
      {$t("exam.actionBar.grade")}
    </button>
    <button class="eab-btn eab-secondary" on:click={onStats}>
      {$t("exam.actionBar.stats")}
    </button>
    <button class="eab-btn eab-secondary" on:click={onEdit}>
      {$t("exam.actionBar.edit")}
    </button>
    <button class="eab-btn eab-danger" on:click={onDeleteAllSubmissions}>
      {$t("exam.actionBar.deleteSubmissions")}
    </button>
    <button class="eab-btn eab-danger" on:click={onExport}>
      {$t("exam.actionBar.export")}
    </button>
    <button class="eab-btn eab-danger" on:click={onDelete}>
      {$t("exam.actionBar.delete")}
    </button>
  </div>
</div>
