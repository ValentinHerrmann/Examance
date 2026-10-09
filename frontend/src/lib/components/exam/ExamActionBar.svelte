<script lang="ts">
  import { t } from "#lib/i18n";
  import { Button } from "#lib/components/ui";

  interface Props {
    examId: string;
    onEdit: () => void;
    onDelete: () => void;
    onExport: () => void;
    onScan: () => void;
    onGrade: () => void;
    onStats: () => void;
    onDeleteAllSubmissions: () => void;
  }

  let {
    examId,
    onEdit,
    onDelete,
    onExport,
    onScan,
    onGrade,
    onStats,
    onDeleteAllSubmissions
  }: Props = $props();
</script>

<!-- Two groups, each on its own line on phones: regular actions, then the destructive pair pushed right from `sm`. -->
<div class="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
  <div class="flex w-full flex-wrap gap-2 sm:w-auto">
    <Button size="sm" variant="outlined" severity="secondary" onClick={onScan}>
      {$t("exam.actionBar.scan")}
    </Button>
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
  </div>

  <div class="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
    <Button size="sm" variant="outlined" severity="danger" onClick={onDeleteAllSubmissions}>
      {$t("exam.actionBar.deleteSubmissions")}
    </Button>
    <Button size="sm" variant="outlined" severity="danger" onClick={onDelete}>
      {$t("exam.actionBar.delete")}
    </Button>
  </div>
</div>
