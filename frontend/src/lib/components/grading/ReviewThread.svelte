<script lang="ts">
  // The student's objection to one item and the teacher's reply field (issue #226). Pseudonymous: the thread carries no name. Renders nothing for an item without an objection.
  import { t } from "#lib/i18n";
  import { Textarea } from "#lib/components/ui";
  import { reviewStore } from "#lib/grading/reviewStore";
  import { REVIEW_TEXT_MAX } from "#lib/sharing/shareCrypto";

  interface Props {
    /** Exercise id, or `${exerciseId}#${part}`. */
    itemKey: string;
    nested?: boolean;
  }

  let { itemKey, nested = false }: Props = $props();

  let objection = $derived($reviewStore.thread?.objections[itemKey]?.trim() ?? "");
  let draft = $derived($reviewStore.drafts[itemKey] ?? "");
  const fieldId = $derived(`review-reply-${itemKey.replace(/[^\w-]/g, "_")}`);
</script>

{#if objection}
  <div class="flex flex-col gap-1.5 rounded-md border border-warning bg-surface-sunken p-2 {nested ? 'ml-4' : ''}">
    <p class="m-0 text-xs font-semibold text-warning-fg">
      {$t("review.thread.objection")}{#if $reviewStore.thread?.fromRecord}<span class="font-normal text-muted"> ({$t("review.thread.fromReplacedLink")})</span>{/if}
    </p>
    <p class="m-0 text-sm break-words whitespace-pre-wrap text-content">{objection}</p>
    {#if $reviewStore.lockFailed}
      <p class="m-0 text-xs text-muted">{$t("review.thread.notLocked")}</p>
    {:else}
      <label for={fieldId} class="text-xs font-semibold text-muted">{$t("review.thread.reply")}</label>
      <Textarea
        id={fieldId}
        size="sm"
        rows={2}
        maxlength={REVIEW_TEXT_MAX}
        placeholder={$t("review.thread.replyPlaceholder")}
        disabled={$reviewStore.sending}
        value={draft}
        oninput={(e) => reviewStore.setDraft(itemKey, e.currentTarget.value.slice(0, REVIEW_TEXT_MAX))}
      />
      <span class="self-end text-xs text-subtle tabular-nums">{$t("review.thread.counter", { count: draft.length, max: REVIEW_TEXT_MAX })}</span>
    {/if}
  </div>
{/if}
