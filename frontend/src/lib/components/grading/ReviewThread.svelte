<script lang="ts">
  // The student's objection to one item and the teacher's reply field (issue #226). Pseudonymous: the thread carries no name. Inline it is compact and PCs only (phones get a badge and the dialog); `full` is the dialog's roomy variant. Renders nothing for an item without an objection.
  import { t } from "#lib/i18n";
  import { Textarea } from "#lib/components/ui";
  import { reviewStore } from "#lib/grading/reviewStore";
  import { REVIEW_TEXT_MAX } from "#lib/sharing/shareCrypto";
  import { isDesktop } from "#lib/stores/viewport";

  interface Props {
    /** Exercise id, or `${exerciseId}#${part}`. */
    itemKey: string;
    nested?: boolean;
    /** The dialog variant: whole objection text, three-row reply, on every screen size. */
    full?: boolean;
  }

  let { itemKey, nested = false, full = false }: Props = $props();

  /** The counter shows only when the limit is near. */
  const COUNTER_FROM = 400;

  let objection = $derived($reviewStore.thread?.objections[itemKey]?.trim() ?? "");
  let draft = $derived($reviewStore.drafts[itemKey] ?? "");
  const fieldId = $derived(`review-reply-${full ? "dialog-" : ""}${itemKey.replace(/[^\w-]/g, "_")}`);

  let focused = $state(false);
  let expanded = $state(false);
  let clamped = $state(false);
  let textEl: HTMLElement | undefined = $state();

  // The "more" toggle exists only while the clamp really hides text.
  $effect(() => {
    if (!objection || full || expanded || !textEl) return;
    clamped = textEl.scrollHeight > textEl.clientHeight + 1;
  });
</script>

{#if objection && (full || $isDesktop)}
  <div class="flex flex-col gap-1 border-l-2 border-warning pl-2 {nested && !full ? 'ml-4' : ''}">
    <p class="m-0 text-xs font-semibold text-warning-fg">
      {$t("review.thread.objection")}{#if $reviewStore.thread?.fromRecord}<span class="ml-1 font-normal text-muted">({$t("review.thread.fromReplacedLink")})</span>{/if}
    </p>
    <p bind:this={textEl} class="m-0 text-sm break-words whitespace-pre-wrap text-content {full || expanded ? '' : 'line-clamp-2'}">{objection}</p>
    {#if !full && (clamped || expanded)}
      <button type="button" class="self-start text-xs text-accent hover:underline" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>
        {expanded ? $t("review.thread.less") : $t("review.thread.more")}
      </button>
    {/if}
    {#if $reviewStore.lockFailed}
      <p class="m-0 text-xs text-muted">{$t("review.thread.notLocked")}</p>
    {:else}
      <Textarea
        id={fieldId}
        size="sm"
        rows={full || focused || draft ? 3 : 1}
        maxlength={REVIEW_TEXT_MAX}
        aria-label={$t("review.thread.reply")}
        placeholder={$t("review.thread.replyPlaceholder")}
        disabled={$reviewStore.sending}
        value={draft}
        onfocus={() => (focused = true)}
        onblur={() => (focused = false)}
        oninput={(e) => reviewStore.setDraft(itemKey, e.currentTarget.value.slice(0, REVIEW_TEXT_MAX))}
      />
      {#if draft.length > COUNTER_FROM}
        <span class="self-end text-xs text-subtle tabular-nums">{$t("review.thread.counter", { count: draft.length, max: REVIEW_TEXT_MAX })}</span>
      {/if}
    {/if}
  </div>
{/if}
