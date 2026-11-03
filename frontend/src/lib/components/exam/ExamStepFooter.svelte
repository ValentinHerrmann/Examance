<script lang="ts">
  import { t } from "#lib/i18n";
  import { Button, actionIcons } from "#lib/components/ui";
  import { EXAM_STEPS, examStepHref, type ExamStep } from "#lib/components/layout/examNavItems";
  import { nextStep } from "#lib/exam/examProgress";

  /** "Next: <step>" at the end of an exam step page (issue #212); same-tab page-flow link. */
  interface Props {
    examId: string;
    step: ExamStep;
  }

  let { examId, step }: Props = $props();

  let next = $derived(nextStep(step));
  let labelKey = $derived(EXAM_STEPS.find((s) => s.step === next)?.labelKey);
</script>

{#if next && labelKey}
  <div class="mt-8 flex justify-end border-t border-line pt-4">
    <Button href={examStepHref(examId, next)} iconRight={actionIcons.next}>
      {$t("exam.flow.next", { step: $t(labelKey) })}
    </Button>
  </div>
{/if}
