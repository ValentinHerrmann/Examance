<script lang="ts">
  // Status and "Send reply" for the open objection of the current submission (issue #226): saves the scores, republishes the result under the same link and sends the replies. Shown only when the submission has an objection.
  import { t } from "#lib/i18n";
  import { Alert, Button, Checkbox, actionIcons } from "#lib/components/ui";
  import { reviewStore } from "#lib/grading/reviewStore";
  import { resendReviewMail, sendReviewReply, showReview } from "#lib/sharing/reviewService";
  import type { SubmissionRecord } from "#lib/db/schema";
  import { formatDate } from "#lib/utils/format";

  interface Props {
    examId: string;
    sub: SubmissionRecord | undefined;
    /** Saves the pending score edits first; rejects when that fails. */
    onFlush: () => Promise<void>;
  }

  let { examId, sub, onFlush }: Props = $props();

  let thread = $derived($reviewStore.thread);
  let mine = $derived(Boolean(sub && $reviewStore.submissionId === sub.id && thread?.submittedAt));
</script>

{#if mine && thread && sub}
  <div class="flex flex-col gap-2 rounded-md border border-line bg-surface-sunken p-2">
    <p class="m-0 text-sm font-semibold text-content">{$t("review.bar.title")}</p>
    {#if thread.unreadable}
      <Alert severity="warning">{$t("review.thread.unreadable")}</Alert>
    {:else}
      <p class="m-0 text-xs text-muted">
        {thread.repliedAt ? $t("review.bar.answered", { date: formatDate(thread.repliedAt) }) : $t("review.bar.received", { date: formatDate(thread.submittedAt ?? "") })}
      </p>
      {#if $reviewStore.lockFailed}
        <Button size="sm" variant="outlined" severity="secondary" onClick={() => showReview(examId, sub)}>{$t("review.bar.retry")}</Button>
      {:else}
        {#if $reviewStore.canMail}
          <Checkbox checked={$reviewStore.notify} label={$t("review.bar.notify")} disabled={$reviewStore.sending} onChange={(on) => reviewStore.patch({ notify: on })} />
        {/if}
        <Button size="sm" icon={actionIcons.send} loading={$reviewStore.sending} disabled={$reviewStore.sending} onClick={() => sendReviewReply(examId, sub, onFlush)}>
          {thread.repliedAt ? $t("review.bar.resend") : $t("review.bar.send")}
        </Button>
        <p class="m-0 text-xs text-subtle">{$t("review.bar.hint")}</p>
      {/if}
    {/if}
    {#if $reviewStore.error}<Alert severity="danger">{$reviewStore.error}</Alert>{/if}
    {#if $reviewStore.sentAt}
      <Alert severity={$reviewStore.mailFailed ? "warning" : "success"}>
        {$reviewStore.mailFailed ? $t("review.bar.mailFailed") : $t("review.bar.sent")}
        {#snippet actions()}
          {#if $reviewStore.mailFailed}
            <Button size="sm" variant="outlined" severity="secondary" disabled={$reviewStore.sending} onClick={resendReviewMail}>{$t("review.bar.resendMail")}</Button>
          {/if}
        {/snippet}
      </Alert>
    {/if}
  </div>
{:else if $reviewStore.error}
  <Alert severity="warning">{$t("review.bar.loadFailed", { message: $reviewStore.error })}</Alert>
{/if}
