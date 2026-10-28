<script lang="ts">
  import { t } from "#lib/i18n";
  import { gradeHref, scanHref, statsHref } from "#lib/utils/links";
  import { faCopy, faFileZipper } from "@fortawesome/free-solid-svg-icons";
  import { Button } from "#lib/components/ui";

  interface Props {
    examId: string;
    onEdit: () => void;
    onDelete: () => void;
    onExport: () => void;
    onDeleteAllSubmissions: () => void;
    onDuplicate: () => void;
    isDuplicating?: boolean;
  }

  let {
    examId,
    onEdit,
    onDelete,
    onExport,
    onDeleteAllSubmissions,
    onDuplicate,
    isDuplicating = false
  }: Props = $props();
</script>

<!-- Two groups, each on its own line on phones: regular actions, then the destructive pair pushed right from `sm`. -->
<div class="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
  <div class="flex w-full flex-wrap gap-2 sm:w-auto">
    <Button size="sm" variant="outlined" severity="secondary" href={scanHref(examId)}>
      {$t("exam.actionBar.scan")}
    </Button>
    <Button size="sm" variant="outlined" severity="secondary" href={gradeHref(examId)}>
      {$t("exam.actionBar.grade")}
    </Button>
    <Button size="sm" variant="outlined" severity="secondary" href={statsHref(examId)}>
      {$t("exam.actionBar.stats")}
    </Button>
    <Button size="sm" variant="outlined" severity="secondary" onClick={onEdit}>
      {$t("exam.actionBar.edit")}
    </Button>
    <Button size="sm" variant="outlined" severity="secondary" icon={faFileZipper} onClick={onExport}>
      {$t("common.export")}
    </Button>
    <Button
      size="sm"
      variant="outlined"
      severity="secondary"
      icon={faCopy}
      loading={isDuplicating}
      title={$t("dashboard.examList.duplicateHint")}
      onClick={onDuplicate}
    >
      {$t("common.duplicate")}
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
