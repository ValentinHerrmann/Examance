<script lang="ts">
  import type { Snippet } from "svelte";
  import { t } from "#lib/i18n";
  import { examNavContext } from "#lib/stores/shell";
  import { EXAM_STEPS, examStepHref, type ExamStep } from "#lib/components/layout/examNavItems";
  import { nextStep } from "#lib/exam/examProgress";
  import { Button, PageHeader, actionIcons } from "#lib/components/ui";
  import type { HelpTopicId } from "#lib/help/topics";

  /** The one header row of an exam step page (issue #212): exam name, step title, the page's actions and "Next: <step>" on the right. */
  interface Props {
    examId: string;
    step: ExamStep;
    title: string;
    /** Shown behind an info icon, not as an extra line. */
    hint?: string;
    helpTopic?: HelpTopicId;
    /** False hides the Next button (the Overview has its own Continue). */
    next?: boolean;
    actions?: Snippet;
  }

  let { examId, step, title, hint, helpTopic, next = true, actions: actions_ }: Props = $props();

  let examTitle = $derived($examNavContext?.examId === examId ? $examNavContext.exam?.title || $t("exam.nav.examFallback") : undefined);
  let nextOf = $derived(next ? nextStep(step) : null);
  let nextLabel = $derived(EXAM_STEPS.find((s) => s.step === nextOf)?.labelKey);
</script>

<PageHeader {title} {hint} {helpTopic} context={examTitle}>
  {#snippet actions()}
    {@render actions_?.()}
    {#if nextOf && nextLabel}
      <Button href={examStepHref(examId, nextOf)} iconRight={actionIcons.next}>{$t("exam.flow.next", { step: $t(nextLabel) })}</Button>
    {/if}
  {/snippet}
</PageHeader>
