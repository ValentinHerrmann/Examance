<script lang="ts">
  // Where a mark outside the active exercise goes (issue #234): switch to the exercise whose area it is in, to another part of the active exercise (a mark in its intro), stay, or pick one for an area no exercise owns. Opened through `ask()`; Escape drops the mark.
  import { ConfirmDialog, Radio } from "#lib/components/ui";
  import { t } from "#lib/i18n";
  import { targetTag, type GradingTarget } from "#lib/grading/gradingTargets";
  import { exerciseTag } from "#lib/grading/scoreEdits";
  import type { GuardAnswer, GuardQuestion } from "#lib/grading/exerciseGuard";

  let question = $state.raw<GuardQuestion | null>(null);
  let chosen = $state("");
  let resolve: ((answer: GuardAnswer) => void) | null = null;

  const keyOf = (target: GradingTarget) => `${target.exercise.id}#${target.partLabel}`;

  /** Asks and resolves with the chosen target (the current one = stay), or null to drop the mark; a newer question answers the open one with null. */
  export function ask(next: GuardQuestion): Promise<GuardAnswer> {
    finish(null);
    question = next;
    const preselect = next.kind === "pick" ? (next.current ?? next.candidates[0]) : next.candidates[0];
    chosen = preselect ? keyOf(preselect) : "";
    return new Promise((r) => (resolve = r));
  }

  function finish(answer: GuardAnswer) {
    const r = resolve;
    resolve = null;
    question = null;
    r?.(answer);
  }

  let single = $derived(question && question.kind !== "pick" && question.candidates.length === 1 ? question.candidates[0] : null);
  let current = $derived(question?.current ? targetTag(question.current) : "");
  let picked = $derived(question?.candidates.find((c) => keyOf(c) === chosen));
  let title = $derived.by(() => {
    if (question?.kind === "pick") return $t("grading.regionGuard.pickTitle");
    if (question?.kind === "part") return $t("grading.regionGuard.partTitle");
    return single ? $t("grading.regionGuard.switchTitle", { target: targetTag(single) }) : $t("grading.regionGuard.switchTitleMany");
  });
  let message = $derived.by(() => {
    if (question?.kind === "pick") return $t("grading.regionGuard.pickBody");
    if (question?.kind === "part") return $t("grading.regionGuard.partBody", { exercise: question.current ? exerciseTag(question.current.exercise) : "", current });
    return $t("grading.regionGuard.switchBody", { current });
  });
</script>

{#if question}
  <ConfirmDialog
    open
    role="dialog"
    title={title}
    message={message}
    confirmText={single ? $t("grading.regionGuard.switchTo", { target: targetTag(single) }) : $t("grading.regionGuard.continueWith", { target: picked ? targetTag(picked) : "" })}
    cancelText={question.kind === "pick" ? $t("grading.regionGuard.cancel") : $t("grading.regionGuard.stay", { current })}
    confirmDisabled={!single && !picked}
    onConfirm={() => finish(single ?? picked ?? null)}
    onCancel={() => finish(question?.kind === "pick" ? null : (question?.current ?? null))}
    onDismiss={() => finish(null)}
  >
    {#if !single}
      <div class="flex max-h-64 flex-col gap-1 overflow-y-auto" role="radiogroup" aria-label={$t("grading.regionGuard.pickLabel")}>
        {#each question.candidates as candidate (keyOf(candidate))}
          <Radio group={chosen} value={keyOf(candidate)} name="region-guard-target" label={targetTag(candidate)} onchange={() => (chosen = keyOf(candidate))} />
        {/each}
      </div>
    {/if}
  </ConfirmDialog>
{/if}
