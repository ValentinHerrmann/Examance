<script lang="ts">
  import { gradingStore } from "$lib/grading/gradingStore";
  import { t } from "$lib/i18n";
  import { faFlagCheckered } from "@fortawesome/free-solid-svg-icons";
  import { Modal, Button, Icon } from "$lib/components/ui";

  export let examId: string;
  export let onStay: () => void;
</script>

<Modal open={$gradingStore.showLastSubModal} size="small" onClose={onStay} bare>
  <div class="flex flex-col items-center gap-4 p-8 text-center">
    <div class="flex size-14 items-center justify-center rounded-full bg-info/20 text-3xl text-info-fg">
      <Icon icon={faFlagCheckered} />
    </div>
    <h3 class="m-0 text-xl font-semibold text-content">{$t("grading.lastSubmission.title")}</h3>
    <p class="m-0 text-sm text-muted">
      {$t("grading.lastSubmission.body")}
    </p>
    <div class="mt-2 flex w-full flex-col gap-2">
      <Button href="/exam/{examId}" block>
        {$t("grading.lastSubmission.backToOverview")}
      </Button>
      <Button variant="outlined" severity="secondary" block onClick={onStay}>
        {$t("grading.lastSubmission.stayHere")}
      </Button>
    </div>
  </div>
</Modal>
