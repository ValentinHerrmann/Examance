<script lang="ts">
  import { gradingStore } from "#lib/grading/gradingStore";
  import { t } from "#lib/i18n";
  import { faTrashCan } from "@fortawesome/free-solid-svg-icons";
  import { Modal, Button, Icon } from "#lib/components/ui";

  interface Props {
    /** Destructive: the parent gates the actual clearing behind this explicit confirmation. */
    onConfirm: () => void;
    onCancel: () => void;
  }

  let { onConfirm, onCancel }: Props = $props();
</script>

<Modal open={$gradingStore.showClearConfirmModal} size="small" onClose={onCancel} bare>
  <div class="flex flex-col items-center gap-4 p-8 text-center">
    <div class="flex size-14 items-center justify-center rounded-full bg-danger/20 text-2xl text-danger-fg">
      <Icon icon={faTrashCan} />
    </div>
    <h3 class="m-0 text-xl font-semibold text-content">{$t("grading.clearModal.title")}</h3>
    <p class="m-0 text-sm text-muted">
      {$t("grading.clearModal.body")}
    </p>
    <div class="mt-2 flex w-full flex-col gap-2">
      <Button severity="danger" block onClick={onConfirm}>
        {$t("grading.clearModal.confirm")}
      </Button>
      <Button variant="outlined" severity="secondary" block onClick={onCancel}>
        {$t("common.cancel")}
      </Button>
    </div>
  </div>
</Modal>
