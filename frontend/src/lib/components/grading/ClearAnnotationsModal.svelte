<script lang="ts">
  import { gradingStore } from "$lib/grading/gradingStore";
  import { t } from "$lib/i18n";
  import { Modal, Button } from "$lib/components/ui";

  // Destructive action confirm/cancel are callback props out to the parent,
  // which gates the actual clearing behind the user's explicit confirmation.
  export let onConfirm: () => void;
  export let onCancel: () => void;
</script>

<Modal open={$gradingStore.showClearConfirmModal} size="sm" onClose={onCancel} bare>
  <div class="flex flex-col items-center gap-4 p-8 text-center">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20 text-2xl text-red-500">
      🗑
    </div>
    <h3 class="m-0 text-xl text-content">{$t("grading.clearModal.title")}</h3>
    <p class="m-0 text-sm text-muted">
      {$t("grading.clearModal.body")}
    </p>
    <div class="mt-2 flex w-full flex-col gap-2">
      <Button variant="danger" block onClick={onConfirm}>
        {$t("grading.clearModal.confirm")}
      </Button>
      <Button variant="secondary" block onClick={onCancel}>
        {$t("common.cancel")}
      </Button>
    </div>
  </div>
</Modal>
