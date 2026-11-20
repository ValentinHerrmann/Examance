<script lang="ts">
  // One footer row for the open objection of the current submission (issue #226): status plus the button that opens the review dialog. Shown only when the submission has an objection.
  import { t } from "#lib/i18n";
  import { Button, Icon } from "#lib/components/ui";
  import { faCommentDots } from "@fortawesome/free-solid-svg-icons";
  import { reviewStore } from "#lib/grading/reviewStore";
  import { resendReviewMail, showReview } from "#lib/sharing/reviewService";
  import type { ExerciseRecord, SubmissionRecord } from "#lib/db/schema";
  import { formatDate } from "#lib/utils/format";
  import ReviewDialog from "./ReviewDialog.svelte";

  interface Props {
    examId: string;
    sub: SubmissionRecord | undefined;
    exercises: ExerciseRecord[];
    /** Saves the pending score edits first; rejects when that fails. */
    onFlush: () => Promise<void>;
  }

  let { examId, sub, exercises, onFlush }: Props = $props();

  let thread = $derived($reviewStore.thread);
  let mine = $derived(Boolean(sub && $reviewStore.submissionId === sub.id && thread?.submittedAt));
  let status = $derived(
    thread?.repliedAt
      ? $t("review.bar.answered", { date: formatDate(thread.repliedAt) })
      : $t("review.bar.open", { date: formatDate(thread?.submittedAt ?? "") })
  );
</script>

{#if mine && thread && sub}
  <div class="flex items-center gap-2">
    <Icon icon={faCommentDots} class="text-warning-fg" />
    {#if thread.unreadable}
      <p class="m-0 min-w-0 flex-1 text-xs text-warning-fg">{$t("review.thread.unreadable")}</p>
    {:else}
      <p class="m-0 min-w-0 flex-1 truncate text-xs text-muted" title={status}>{status}</p>
      {#if $reviewStore.lockFailed}
        <Button size="sm" variant="outlined" severity="secondary" onClick={() => showReview(examId, sub)}>{$t("review.bar.retry")}</Button>
      {:else}
        <Button size="sm" variant="outlined" severity="secondary" onClick={() => reviewStore.patch({ dialog: "items" })}>
          {$t("review.bar.edit")}
        </Button>
      {/if}
    {/if}
  </div>
  {#if !$reviewStore.dialog}
    {#if $reviewStore.error}
      <p class="m-0 text-xs text-danger-fg">{$reviewStore.error}</p>
    {:else if $reviewStore.sentAt || $reviewStore.mailFailed}
      <p class="m-0 flex items-center gap-2 text-xs {$reviewStore.mailFailed ? 'text-warning-fg' : 'text-success-fg'}">
        <span class="min-w-0 flex-1">{$reviewStore.mailFailed ? $t("review.bar.mailFailed") : $t("review.bar.sent")}</span>
        {#if $reviewStore.mailFailed}
          <Button size="sm" variant="text" severity="secondary" disabled={$reviewStore.sending} onClick={resendReviewMail}>{$t("review.bar.resendMail")}</Button>
        {/if}
      </p>
    {/if}
  {/if}
  <ReviewDialog {examId} {sub} {exercises} {onFlush} />
{:else if $reviewStore.error}
  <p class="m-0 text-xs text-warning-fg">{$t("review.bar.loadFailed", { message: $reviewStore.error })}</p>
{/if}
