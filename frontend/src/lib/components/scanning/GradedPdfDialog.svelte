<script lang="ts">
  import { t } from "#lib/i18n";
  import { Button, Modal, actionIcons } from "#lib/components/ui";
  import ReviewPrintOptions from "#lib/components/export/ReviewPrintOptions.svelte";
  import type { ReviewPrintOptions as ReviewPrintChoice } from "#lib/export/reviewPrint";
  import { loadReviewPrint } from "#lib/export/reviewPrintPrefs";

  /** Asks how a student's objection is printed into the single graded PDF (issue #226); opened only for a paper that has one. */
  interface Props {
    onConfirm: (options: ReviewPrintChoice) => void;
    onClose: () => void;
  }

  let { onConfirm, onClose }: Props = $props();
  let options = $state(loadReviewPrint("export"));
</script>

<Modal open={true} size="medium" title={$t("export.review.download.title")} {onClose}>
  <ReviewPrintOptions bind:options scope="export" hasReviews={true} single />
  {#snippet footer()}
    <Button variant="outlined" severity="secondary" onClick={onClose}>{$t("common.cancel")}</Button>
    <Button icon={actionIcons.download} onClick={() => onConfirm($state.snapshot(options))}>{$t("export.review.download.confirm")}</Button>
  {/snippet}
</Modal>
