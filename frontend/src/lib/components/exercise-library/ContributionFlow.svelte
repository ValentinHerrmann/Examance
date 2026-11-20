<script lang="ts">
  // Change proposals between shared exercises (issue #65, docs/dev/exercise_sharing.md): proposing changes back to a source (`contribute`), deciding on a received one (`review`) and withdrawing an own one (`withdraw`). The lists stay on the page; this flow reports what to reload.
  import { ApiError, apiErrorMessage } from "#lib/api/client";
  import {
    acceptContribution,
    loadContribution,
    rejectContribution,
    submitContributions,
    withdrawContribution,
    type ContributionDetail,
    type ContributionSummary,
  } from "#lib/api/exerciseContributions";
  import { loadResyncPreview, type ResyncPreview } from "#lib/api/exerciseSharing";
  import type { ExerciseGroup } from "#lib/exercise-library/groupExercises";
  import { translate, type TranslationKey } from "#lib/i18n";
  import { sessionStore } from "#lib/stores/session";
  import ContributeModal from "./ContributeModal.svelte";
  import ReviewContributionModal from "./ReviewContributionModal.svelte";

  interface Props {
    /** The proposal being withdrawn, for the list's busy state. */
    withdrawingId?: string;
    /** Success line for the page's notice. */
    onNotice: (message: string) => void;
    /** Error line for the page (withdraw has no dialog of its own). */
    onError: (message: string) => void;
    /** After an accepted proposal: the proposals and the library changed. */
    onAccepted: () => Promise<void> | void;
    /** After a rejection or a withdrawal: the proposals and the sync status changed. */
    onDecided: () => Promise<void> | void;
    /** After a submitted proposal: the sync status changed. */
    onSubmitted: () => Promise<void> | void;
  }

  let { withdrawingId = $bindable(""), onNotice, onError, onAccepted, onDecided, onSubmitted }: Props = $props();

  /** The server's message, else the given fallback text. */
  const failText = (err: unknown, fallback: TranslationKey) => apiErrorMessage(err, translate(fallback));

  let reviewId = $state("");
  let reviewDetail: ContributionDetail | null = $state.raw(null);
  let isReviewBusy = $state(false);
  let reviewError = $state("");
  /** Set after a 409 on accept: the reloaded detail keeps the author's hand-merged text. */
  let reviewKeepEdits = $state(false);
  let contributeGroupId = $state("");
  let contributePreview: ResyncPreview | null = $state.raw(null);
  let isContributeBusy = $state(false);
  let contributeError = $state("");

  export function review(item: ContributionSummary) {
    reviewId = item.id;
    reviewDetail = null;
    reviewKeepEdits = false;
    fetchReviewDetail(item.id);
  }

  /** Applies the answer only while `id` is still the open review (a late one must not land on another). */
  async function fetchReviewDetail(id: string) {
    reviewError = "";
    try {
      const detail = await loadContribution(id);
      if (reviewId === id) reviewDetail = detail;
    } catch (err) {
      if (reviewId === id) reviewError = failText(err, "exercises.contributions.loadFailed");
    }
  }

  function closeReview() {
    reviewId = "";
    reviewDetail = null;
  }

  async function handleAcceptProposal(id: string, opts: { latexBody?: string; asVariant: boolean; variantKey?: string }) {
    isReviewBusy = true;
    reviewError = "";
    try {
      await acceptContribution(id, opts);
      if (reviewId === id) closeReview();
      onNotice(translate("exercises.contributions.accepted"));
      await onAccepted();
    } catch (err) {
      if (reviewId !== id) return;
      reviewError = failText(err, "exercises.contributions.decideFailed");
      if (err instanceof ApiError && err.status === 409) {
        const fresh = await loadContribution(id).catch(() => null);
        if (fresh && reviewId === id) {
          reviewKeepEdits = true;
          reviewDetail = fresh;
        }
      }
    } finally {
      isReviewBusy = false;
    }
  }

  async function handleRejectProposal(id: string, note: string) {
    isReviewBusy = true;
    reviewError = "";
    try {
      await rejectContribution(id, note);
      if (reviewId === id) closeReview();
      await onDecided();
    } catch (err) {
      if (reviewId === id) reviewError = failText(err, "exercises.contributions.decideFailed");
    } finally {
      isReviewBusy = false;
    }
  }

  export async function withdraw(item: ContributionSummary) {
    withdrawingId = item.id;
    onError("");
    try {
      await withdrawContribution(item.id);
      await onDecided();
    } catch (err) {
      onError(failText(err, "exercises.contributions.decideFailed"));
    } finally {
      withdrawingId = "";
    }
  }

  export function contribute(group: ExerciseGroup) {
    contributeGroupId = group.groupId;
    contributePreview = null;
    fetchContributePreview(group.groupId);
  }

  async function fetchContributePreview(groupId: string) {
    contributeError = "";
    try {
      const preview = await loadResyncPreview(groupId);
      if (contributeGroupId === groupId) contributePreview = preview;
    } catch (err) {
      if (contributeGroupId === groupId) contributeError = failText(err, "exercises.contributions.loadFailed");
    }
  }

  async function handleSubmitContribution(exerciseIds: string[], message: string) {
    const groupId = contributeGroupId;
    if (!groupId) return;
    isContributeBusy = true;
    contributeError = "";
    try {
      await submitContributions(groupId, exerciseIds, message);
      if (contributeGroupId === groupId) contributeGroupId = "";
      onNotice(translate("exercises.contributions.submitted"));
      await onSubmitted();
    } catch (err) {
      if (contributeGroupId === groupId) contributeError = failText(err, "exercises.contributions.submitFailed");
    } finally {
      isContributeBusy = false;
    }
  }
</script>

<ContributeModal
  open={!!contributeGroupId}
  preview={contributePreview}
  email={$sessionStore.email ?? ""}
  busy={isContributeBusy}
  error={contributeError}
  onRetry={() => fetchContributePreview(contributeGroupId)}
  onSubmit={handleSubmitContribution}
  onClose={() => (contributeGroupId = "")}
/>

<ReviewContributionModal
  open={!!reviewId}
  detail={reviewDetail}
  busy={isReviewBusy}
  error={reviewError}
  keepEdits={reviewKeepEdits}
  onRetry={() => fetchReviewDetail(reviewId)}
  onAccept={handleAcceptProposal}
  onReject={handleRejectProposal}
  onClose={closeReview}
/>
