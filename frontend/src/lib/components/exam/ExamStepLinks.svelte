<script lang="ts">
  import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { EXAM_STEPS, examStepHref, type ExamStep } from "#lib/components/layout/examNavItems";
  import ExamStepBadge from "#lib/components/layout/ExamStepBadge.svelte";
  import { continueStep, type ExamProgress } from "#lib/exam/examProgress";
  import { Icon, Tooltip } from "#lib/components/ui";

  /** Every step of the exam flow as a link with its badge (issue #212): `row` in the exam list, `stepper` (numbered, › between steps, next step highlighted) on the exam's Overview. */
  interface Props {
    examId: string;
    progress: ExamProgress;
    layout?: "row" | "stepper";
  }

  let { examId, progress, layout = "row" }: Props = $props();

  const STEPS = EXAM_STEPS.filter((s) => s.step !== "overview");
  let next = $derived<ExamStep>(continueStep(progress));
</script>

{#if layout === "row"}
  <ul class="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm text-muted" aria-label={$t("dashboard.examList.progress")}>
    {#each STEPS as entry (entry.step)}
      <li class="min-w-0">
        <Tooltip text={$t("dashboard.examList.openStep", { step: $t(entry.labelKey) })}>
          <a
            href={examStepHref(examId, entry.step)}
            class="group inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-muted no-underline transition-colors hover:bg-surface-sunken hover:text-accent focus-visible:bg-surface-sunken focus-visible:text-accent"
          >
            <Icon icon={entry.icon} class="w-3.5" />
            <span class="group-hover:underline group-focus-visible:underline">{$t(entry.labelKey)}</span>
            <ExamStepBadge status={progress[entry.step]} step={entry.step} />
            <Icon icon={faChevronRight} class="w-2.5 text-xs opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          </a>
        </Tooltip>
      </li>
    {/each}
  </ul>
{:else}
  <ol class="m-0 flex list-none flex-wrap items-center gap-x-1 gap-y-2 p-0 text-sm" aria-label={$t("exam.overview.workflow")}>
    {#each STEPS as entry, index (entry.step)}
      {@const isNext = entry.step === next}
      <li class="flex min-w-0 items-center gap-1">
        {#if index > 0}<Icon icon={faChevronRight} class="w-2.5 text-xs text-muted" />{/if}
        <a
          href={examStepHref(examId, entry.step)}
          aria-current={isNext ? "step" : undefined}
          class="group flex max-w-44 items-center gap-2 rounded-md border px-2.5 py-1.5 leading-tight no-underline transition-colors {isNext
            ? 'border-primary bg-highlight font-medium text-on-highlight'
            : 'border-line text-content hover:bg-surface-inset hover:text-accent'}"
        >
          <span class="tabular-nums opacity-70">{index + 1}</span>
          <Icon icon={entry.icon} class="w-3.5 shrink-0" />
          <span class="min-w-0 group-hover:underline">{$t(entry.labelKey)}</span>
          <ExamStepBadge status={progress[entry.step]} step={entry.step} />
        </a>
      </li>
    {/each}
  </ol>
{/if}
