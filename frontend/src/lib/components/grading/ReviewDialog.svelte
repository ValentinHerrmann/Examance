<script lang="ts">
  // The objection dialog of the current submission (issue #226): the objected items with their score and reply field, then the send step, at every screen size (the slim score panel has no room for the threads, issue #328). Drafts live in `reviewStore`, so the inline threads and this dialog share them. Sending saves the scores, republishes the result under the same link and sends the replies.
  import { get } from "svelte/store";
  import type { ExerciseRecord, SubmissionRecord } from "#lib/db/schema";
  import { t } from "#lib/i18n";
  import { Button, Checkbox, Modal, actionIcons } from "#lib/components/ui";
  import { gradingStore } from "#lib/grading/gradingStore";
  import { exerciseParts, hasPartValues, partOverrideKey } from "#lib/grading/partScores";
  import { exerciseTag, resetExercise, resetPart, setPart, setTotal } from "#lib/grading/scoreEdits";
  import { reviewStore } from "#lib/grading/reviewStore";
  import { sendReviewReply } from "#lib/sharing/reviewService";
  import ReviewThread from "./ReviewThread.svelte";
  import ScoreRow from "./ScoreRow.svelte";

  interface Props {
    examId: string;
    sub: SubmissionRecord;
    exercises: ExerciseRecord[];
    /** Saves the pending score edits first; rejects when that fails. */
    onFlush: () => Promise<void>;
  }

  let { examId, sub, exercises, onFlush }: Props = $props();

  let thread = $derived($reviewStore.thread);

  const objected = (key: string) => Boolean(thread?.objections[key]?.trim());
  const close = () => reviewStore.patch({ dialog: null });

  async function send() {
    await sendReviewReply(examId, sub, onFlush);
    if (!get(reviewStore).error) close();
  }
</script>

<Modal
  open={$reviewStore.dialog !== null}
  size="large"
  tall
  title={$t("review.bar.title")}
  error={$reviewStore.error}
  onClose={() => { if (!$reviewStore.sending) close(); }}
>
  <div class="flex flex-col gap-4">
    {#each exercises as ex (ex.id)}
      {@const parts = $gradingStore.partInputs[ex.id]}
      {#if objected(ex.id)}
        <div class="flex flex-col gap-2">
          <div class="overflow-hidden rounded-md border border-line"><ScoreRow
            value={$gradingStore.scoreInputs[ex.id]}
            max={ex.maxPoints}
            active={false}
            manual={!!$gradingStore.manualOverride[ex.id] && !hasPartValues(parts)}
            readonlyReason={exerciseParts(ex).length > 0 ? $t("grading.scoreEntry.sumOfParts") : undefined}
            inputId={`review-score-${ex.id}`}
            onSelect={() => {}}
            onValue={(v) => setTotal(ex, v)}
            onReset={() => resetExercise(ex)}
          >
            {#snippet label()}<span class="text-xs font-bold text-content">{exerciseTag(ex)}</span>{/snippet}
          </ScoreRow></div>
          <ReviewThread itemKey={ex.id} />
        </div>
      {/if}
      {#each exerciseParts(ex) as part (part.label)}
        {#if objected(partOverrideKey(ex.id, part.label))}
          <div class="flex flex-col gap-2">
            <div class="overflow-hidden rounded-md border border-line"><ScoreRow
              value={parts?.[part.label]}
              max={part.max}
              active={false}
              manual={!!$gradingStore.manualOverride[partOverrideKey(ex.id, part.label)]}
              ariaLabel={$t("grading.scoreEntry.partRowLabel", { label: part.label })}
              onSelect={() => {}}
              onValue={(v) => setPart(ex, part.label, v)}
              onReset={() => resetPart(ex, part.label)}
            >
              {#snippet label()}
                <span class="text-xs font-bold text-content">{exerciseTag(ex)}</span>
                <span class="text-xs font-semibold text-content">{$t("grading.scoreEntry.partRowLabel", { label: part.label })}</span>
              {/snippet}
            </ScoreRow></div>
            <ReviewThread itemKey={partOverrideKey(ex.id, part.label)} />
          </div>
        {/if}
      {/each}
    {/each}
  </div>
  <p class="m-0 mt-4 text-sm text-muted">{$t("review.bar.hint")}</p>

  {#snippet footer()}
    {#if $reviewStore.canMail}
      <Checkbox class="mr-auto" checked={$reviewStore.notify} label={$t("review.bar.notify")} disabled={$reviewStore.sending} onChange={(on) => reviewStore.patch({ notify: on })} />
    {:else if $reviewStore.mailBlocked}
      <div class="mr-auto min-w-0">
        <Checkbox checked={false} label={$t("review.bar.notify")} disabled />
        <p class="m-0 text-xs text-muted">{$t("review.bar.notifyNoFactor")}</p>
      </div>
    {/if}
    <Button icon={actionIcons.send} loading={$reviewStore.sending} disabled={$reviewStore.sending || $reviewStore.lockFailed} onClick={send}>
      {thread?.repliedAt ? $t("review.bar.resend") : $t("review.bar.send")}
    </Button>
  {/snippet}
</Modal>
