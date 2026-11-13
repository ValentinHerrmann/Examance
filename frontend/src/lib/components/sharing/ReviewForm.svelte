<script lang="ts">
  // The student's objection form on the result page (issue #226, docs/dev/grading_review.md): one text per (sub)exercise, sealed in this browser under a key only the link yields. Editable until the teacher opens it or the deadline passes; the teacher's replies appear here.
  import { onMount } from "svelte";
  import { apiErrorMessage } from "#lib/api/client";
  import { submitShareReview, withdrawShareReview, type SealedReview } from "#lib/api/resultShares";
  import { t } from "#lib/i18n";
  import { Alert, Button, Card, Textarea } from "#lib/components/ui";
  import { openReviewPart, REVIEW_TEXT_MAX, sealReviewPart, type ReplyPayload, type ReviewItem } from "#lib/sharing/shareCrypto";
  import { formatDate, formatDateTime } from "#lib/utils/format";

  interface Props {
    shareId: string;
    /** The lookup secret the link derives, sent with every change. */
    lookup: Uint8Array;
    contentKey: Uint8Array;
    items: ReviewItem[];
    /** Objections are accepted until then (ISO). */
    reviewUntil: string;
    review: SealedReview | null;
  }

  let { shareId, lookup, contentKey, items, reviewUntil, review }: Props = $props();

  const NOW = Date.now();
  let texts = $state<Record<string, string>>({});
  let saved = $state.raw<Record<string, string>>({});
  let submittedAt = $state<string | null>(null);
  let openedAt = $state<string | null>(null);
  let replies = $state.raw<ReplyPayload["items"]>({});
  let repliedAt = $state<string | null>(null);
  let busy = $state(false);
  let error = $state("");

  let closed = $derived(NOW > Date.parse(reviewUntil));
  let locked = $derived(openedAt !== null || closed);
  let labelOf = $derived(new Map(items.map((i) => [i.key, i.label])));
  const clean = (all: Record<string, string>) => Object.fromEntries(Object.entries(all).map(([k, v]) => [k, v.trim()]).filter(([, v]) => v));
  let changed = $derived(JSON.stringify(clean(texts)) !== JSON.stringify(saved));
  let filled = $derived(Object.keys(clean(texts)).length > 0);

  onMount(async () => {
    submittedAt = review?.submittedAt ?? null;
    openedAt = review?.openedAt ?? null;
    repliedAt = review?.repliedAt ?? null;
    try {
      if (review?.objection) saved = (await openReviewPart(shareId, contentKey, "objection", review.objection.ciphertext, review.objection.iv)).items;
      texts = { ...saved };
      if (review?.reply) replies = (await openReviewPart(shareId, contentKey, "reply", review.reply.ciphertext, review.reply.iv)).items;
    } catch (err) {
      console.warn("The review could not be opened:", err);
    }
  });

  async function submit() {
    busy = true;
    error = "";
    const items = clean(texts);
    try {
      await submitShareReview(shareId, lookup, await sealReviewPart(shareId, contentKey, "objection", { items }));
      saved = items;
      submittedAt = new Date().toISOString();
    } catch (err) {
      error = apiErrorMessage(err, $t("review.form.failed"));
    } finally {
      busy = false;
    }
  }

  async function withdraw() {
    busy = true;
    error = "";
    try {
      await withdrawShareReview(shareId, lookup);
      saved = {};
      texts = {};
      submittedAt = null;
    } catch (err) {
      error = apiErrorMessage(err, $t("review.form.failed"));
    } finally {
      busy = false;
    }
  }

  const pointsText = (item: ReviewItem) => (item.points === null ? $t("review.form.pointsNone", { max: item.max }) : $t("review.form.points", { points: item.points, max: item.max }));
</script>

<Card class="flex flex-col gap-4">
  <div class="flex min-w-0 flex-col gap-1">
    <h2 class="m-0 text-lg font-semibold">{$t("review.form.title")}</h2>
    {#if !locked}
      <p class="m-0 text-sm text-muted">{$t("review.form.intro")}</p>
      <p class="m-0 text-sm text-muted">{$t("review.form.deadline", { date: formatDateTime(reviewUntil) })}</p>
      <p class="m-0 text-sm text-warning-fg">{$t("review.form.noName")}</p>
    {:else if openedAt}
      <p class="m-0 text-sm text-muted">{$t("review.form.locked")}</p>
    {:else if !submittedAt}
      <p class="m-0 text-sm text-muted">{$t("review.form.closed")}</p>
    {/if}
    {#if submittedAt && !locked}
      <p class="m-0 text-sm text-muted">{$t("review.form.submitted", { date: formatDate(submittedAt) })}</p>
    {/if}
  </div>

  {#if !locked || submittedAt}
    <div class="flex flex-col gap-3">
      {#each items as item (item.key)}
        {@const id = `objection-${item.key.replace(/[^\w-]/g, "_")}`}
        {#if !locked || saved[item.key]}
          <div class="flex min-w-0 flex-col gap-1">
            <label for={id} class="text-sm font-semibold break-words">
              {$t("review.form.item", { label: item.label })}
              <span class="font-normal text-muted">({pointsText(item)})</span>
            </label>
            {#if locked}
              <p {id} class="m-0 text-sm break-words whitespace-pre-wrap">{saved[item.key]}</p>
            {:else}
              <Textarea {id} rows={2} maxlength={REVIEW_TEXT_MAX} disabled={busy} placeholder={$t("review.form.placeholder", { label: item.label })} bind:value={texts[item.key]} />
              <span class="self-end text-xs text-subtle tabular-nums">{$t("review.form.counter", { count: (texts[item.key] ?? "").length, max: REVIEW_TEXT_MAX })}</span>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  {#if error}<Alert severity="danger">{error}</Alert>{/if}

  {#if !locked}
    <div class="flex flex-wrap gap-2">
      <Button loading={busy} disabled={busy || !filled || !changed} onClick={submit}>{submittedAt ? $t("review.form.update") : $t("review.form.submit")}</Button>
      {#if submittedAt}
        <Button variant="outlined" severity="secondary" disabled={busy} onClick={withdraw}>{$t("review.form.withdraw")}</Button>
      {/if}
    </div>
  {/if}

  {#if repliedAt && Object.keys(replies).length > 0}
    <div class="flex flex-col gap-3 border-t border-line pt-3">
      <h3 class="m-0 text-base font-semibold">{$t("review.form.reply")}</h3>
      {#each Object.entries(replies) as [key, reply] (key)}
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="text-sm font-semibold">{$t("review.form.item", { label: labelOf.get(key) ?? key })}</span>
          {#if reply.text}<p class="m-0 text-sm break-words whitespace-pre-wrap">{reply.text}</p>{/if}
          {#if reply.pointsBefore !== reply.pointsAfter}
            <span class="text-sm text-muted">{$t("review.form.pointsChange", { before: reply.pointsBefore ?? "–", after: reply.pointsAfter ?? "–" })}</span>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</Card>
