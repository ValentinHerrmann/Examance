<script lang="ts">
  // The student's objection to one item and the teacher's reply field (issue #226), shown only in the review dialog (the slim score panel has no room for it, issue #328). Pseudonymous: the thread carries no name. Renders nothing for an item without an objection.
  import { t } from "#lib/i18n";
  import { Textarea } from "#lib/components/ui";
  import { reviewStore } from "#lib/grading/reviewStore";
  import { REVIEW_TEXT_MAX } from "#lib/sharing/shareCrypto";

  interface Props {
    /** Exercise id, or `${exerciseId}#${part}`. */
    itemKey: string;
  }

  let { itemKey }: Props = $props();

  /** The counter shows only when the limit is near. */
  const COUNTER_FROM = 400;

  let objection = $derived($reviewStore.thread?.objections[itemKey]?.trim() ?? "");
  let draft = $derived($reviewStore.drafts[itemKey] ?? "");
  const fieldId = $derived(`review-reply-dialog-${itemKey.replace(/[^\w-]/g, "_")}`);
</script>

{#if objection}
  <div class="flex flex-col gap-1 border-l-2 border-warning pl-2">
    <p class="m-0 text-xs font-semibold text-warning-fg">
      {$t("review.thread.objection")}{#if $reviewStore.thread?.fromRecord}<span class="ml-1 font-normal text-muted">({$t("review.thread.fromReplacedLink")})</span>{/if}
    </p>
    <p class="m-0 text-sm break-words whitespace-pre-wrap text-content">{objection}</p>
    {#if $reviewStore.lockFailed}
      <p class="m-0 text-xs text-muted">{$t("review.thread.notLocked")}</p>
    {:else}
      <Textarea
        id={fieldId}
        size="sm"
        rows={3}
        maxlength={REVIEW_TEXT_MAX}
        aria-label={$t("review.thread.reply")}
        placeholder={$t("review.thread.replyPlaceholder")}
        disabled={$reviewStore.sending}
        value={draft}
        oninput={(e) => reviewStore.setDraft(itemKey, e.currentTarget.value.slice(0, REVIEW_TEXT_MAX))}
      />
      {#if draft.length > COUNTER_FROM}
        <span class="self-end text-xs text-subtle tabular-nums">{$t("review.thread.counter", { count: draft.length, max: REVIEW_TEXT_MAX })}</span>
      {/if}
    {/if}
  </div>
{/if}
