<script lang="ts">
  import { untrack } from "svelte";
  import { t } from "#lib/i18n";
  import { listResultDeliveries } from "#lib/api/resultShares";
  import { latestDeliveries, undelivered } from "#lib/sharing/shareService";
  import { featuresStore } from "#lib/stores/capabilities";
  import { gradeHref, scanHref, resultsHref, studentsHref } from "#lib/utils/links";
  import { faCopy, faFileZipper, faQrcode, faShareFromSquare, faUsers } from "@fortawesome/free-solid-svg-icons";
  import { Badge, Button } from "#lib/components/ui";

  interface Props {
    examId: string;
    onEdit: () => void;
    onDelete: () => void;
    onExport: () => void;
    onStickers: () => void;
    onShare: () => void;
    /** True while the share dialog is open; on close the delivery badge is refreshed. */
    sharing?: boolean;
    onDeleteAllSubmissions: () => void;
    onDuplicate: () => void;
    isDuplicating?: boolean;
  }

  let {
    examId,
    onEdit,
    onDelete,
    onExport,
    onStickers,
    onShare,
    sharing = false,
    onDeleteAllSubmissions,
    onDuplicate,
    isDuplicating = false
  }: Props = $props();

  // Students a result mail or Artemis message did not reach (issue #221), so late bounces show without opening the dialog.
  let notReached = $state(0);

  async function loadNotReached(id: string) {
    try {
      notReached = [...latestDeliveries(await listResultDeliveries(id)).values()].filter(undelivered).length;
    } catch {
      notReached = 0;
    }
  }

  $effect.pre(() => {
    const id = examId;
    const open = sharing;
    const enabled = $featuresStore.result_delivery;
    untrack(() => {
      if (enabled && !open) void loadNotReached(id);
    });
  });
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
    <Button size="sm" variant="outlined" severity="secondary" href={resultsHref(examId)}>
      {$t("exam.actionBar.stats")}
    </Button>
    <Button size="sm" variant="outlined" severity="secondary" onClick={onEdit}>
      {$t("exam.actionBar.edit")}
    </Button>
    <Button size="sm" variant="outlined" severity="secondary" icon={faFileZipper} onClick={onExport}>
      {$t("common.export")}
    </Button>
    <!-- Student data lives on its own page; QR printing and sharing only read it. -->
    <Button size="sm" variant="outlined" severity="secondary" icon={faUsers} href={studentsHref(examId)}>
      {$t("lms.students.open")}
    </Button>
    <Button size="sm" variant="outlined" severity="secondary" icon={faQrcode} onClick={onStickers}>
      {$t("sharing.actions.stickers")}
    </Button>
    <Button size="sm" variant="outlined" severity="secondary" icon={faShareFromSquare} onClick={onShare}>
      {$t("sharing.actions.share")}
      {#if notReached}<Badge size="xs" severity="danger">{$t("sharing.delivery.badge", { count: notReached })}</Badge>{/if}
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
