<script lang="ts">
  import { gradingStore } from "$lib/grading/gradingStore";
  import { t } from "$lib/i18n";
  import { Modal, Button } from "$lib/components/ui";

  export let examId: string;
  export let onStay: () => void;
</script>

<Modal open={$gradingStore.showLastSubModal} size="sm" onClose={onStay} bare>
  <div class="flex flex-col items-center gap-4 p-8 text-center">
    <div class="flex h-14 w-14 items-center justify-center rounded-full bg-indigo-500/20 text-[1.75rem]">
      🏁
    </div>
    <h3 class="m-0 text-xl text-content">{$t("grading.lastSubmission.title")}</h3>
    <p class="m-0 text-sm text-muted">
      {$t("grading.lastSubmission.body")}
    </p>
    <div class="mt-2 flex w-full flex-col gap-2">
      <a
        href="/exam/{examId}"
        class="box-border w-full rounded-lg bg-indigo-600 px-4 py-[0.65rem] text-center text-sm font-semibold text-white no-underline transition-colors duration-150 ease-[ease] hover:bg-indigo-700"
      >
        {$t("grading.lastSubmission.backToOverview")}
      </a>
      <Button variant="secondary" block onClick={onStay}>
        {$t("grading.lastSubmission.stayHere")}
      </Button>
    </div>
  </div>
</Modal>
