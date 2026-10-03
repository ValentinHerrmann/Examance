<script lang="ts">
  import { t } from "$lib/i18n";
  import { Button } from "$lib/components/ui";
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

<div class="mb-6 flex flex-wrap items-center justify-between gap-2">
  <div class="flex flex-wrap gap-2">
    <Button size="sm" onClick={onAddExercises}>
      {$t("exam.actionBar.addExercises")}
    </Button>
    {#if storagePolicy === 'all-local'}
      <Button size="sm" variant="outlined" severity="secondary" onClick={onScan}>
        {$t("exam.actionBar.scan")}
      </Button>
    {/if}
  </div>

  <div class="flex flex-wrap gap-2">
    <Button size="sm" variant="outlined" severity="secondary" onClick={onGrade}>
      {$t("exam.actionBar.grade")}
    </Button>
    <Button size="sm" variant="outlined" severity="secondary" onClick={onStats}>
      {$t("exam.actionBar.stats")}
    </Button>
    <Button size="sm" variant="outlined" severity="secondary" onClick={onEdit}>
      {$t("exam.actionBar.edit")}
    </Button>
    <Button size="sm" variant="outlined" severity="secondary" onClick={onExport}>
      {$t("exam.actionBar.export")}
    </Button>
    <Button size="sm" variant="outlined" severity="danger" onClick={onDeleteAllSubmissions}>
      {$t("exam.actionBar.deleteSubmissions")}
    </Button>
    <Button size="sm" variant="outlined" severity="danger" onClick={onDelete}>
      {$t("exam.actionBar.delete")}
    </Button>
  </div>
</div>
