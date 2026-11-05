<script lang="ts">
  import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { EXAM_STEPS, examStepHref, stepNumber, type ExamStep } from "#lib/components/layout/examNavItems";
  import ExamStepBadge from "#lib/components/layout/ExamStepBadge.svelte";
  import { continueStep, type ExamProgress } from "#lib/exam/examProgress";
  import { Icon, Tooltip } from "#lib/components/ui";

  /** Every step of the exam flow as a link with its badge (issue #212): `row` in the exam list, `stepper` (numbered, › between steps, the two grading branches as a fork, next step highlighted) on the exam's Overview. */
  interface Props {
    examId: string;
    progress: ExamProgress;
    layout?: "row" | "stepper";
  }

  let { examId, progress, layout = "row" }: Props = $props();

  const STEPS = EXAM_STEPS.filter((s) => s.step !== "overview");
  const firstBranch = STEPS.findIndex((s) => s.branch);
  const lastBranch = STEPS.length - 1 - [...STEPS].reverse().findIndex((s) => s.branch);
  const BEFORE = STEPS.slice(0, firstBranch);
  const BRANCH_A = STEPS.filter((s) => s.branch === "A");
  const BRANCH_B = STEPS.filter((s) => s.branch === "B");
  const AFTER = STEPS.slice(lastBranch + 1);
  let next = $derived<ExamStep>(continueStep(progress));
</script>

{#snippet arrow()}<Icon icon={faChevronRight} class="w-2.5 shrink-0 text-xs text-muted" />{/snippet}

{#snippet stepLink(entry: (typeof STEPS)[number])}
  {@const isNext = entry.step === next}
  <a
    href={examStepHref(examId, entry.step)}
    aria-current={isNext ? "step" : undefined}
    class="group flex max-w-44 items-center gap-2 rounded-md border px-2.5 py-1.5 leading-tight no-underline transition-colors {isNext
      ? 'border-primary bg-highlight font-medium text-on-highlight'
      : 'border-line text-content hover:bg-surface-inset hover:text-accent'}"
  >
    <span class="tabular-nums {isNext ? '' : 'text-muted'}">{stepNumber(entry.step)}</span>
    <Icon icon={entry.icon} class="w-3.5 shrink-0" />
    <span class="min-w-0 group-hover:underline">{$t(entry.labelKey)}</span>
    <ExamStepBadge status={progress[entry.step]} step={entry.step} />
  </a>
{/snippet}

{#if layout === "row"}
  <ul class="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-sm text-muted" aria-label={$t("dashboard.examList.progress")}>
    {#each STEPS as entry (entry.step)}
      {#if entry.branch === "B"}<li class="self-center text-xs text-muted" title={$t("exam.sidebar.orHint")}>{$t("exam.sidebar.or")}</li>{/if}
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
  <!-- Steps 1–3, then the two alternatives (A with scans, B graded on paper) stacked as a fork, then Results. -->
  <ol class="m-0 flex list-none flex-wrap items-center gap-x-1 gap-y-2 p-0 text-sm" aria-label={$t("exam.overview.workflow")}>
    {#each BEFORE as entry, index (entry.step)}
      <li class="flex min-w-0 items-center gap-1">
        {#if index > 0}{@render arrow()}{/if}
        {@render stepLink(entry)}
      </li>
    {/each}
    <li class="flex min-w-0 items-center gap-1">
      {@render arrow()}
      <div class="flex min-w-0 flex-col gap-1 rounded-lg border border-dashed border-line-strong p-1.5">
        <ol class="m-0 flex list-none flex-wrap items-center gap-1 p-0" aria-label="A">
          {#each BRANCH_A as entry, index (entry.step)}
            <li class="flex min-w-0 items-center gap-1">
              {#if index > 0}{@render arrow()}{/if}
              {@render stepLink(entry)}
            </li>
          {/each}
        </ol>
        <div class="flex items-center gap-2 px-1 text-xs text-muted" title={$t("exam.sidebar.orHint")}>
          <span class="h-px flex-1 bg-line"></span>{$t("exam.sidebar.or")}<span class="h-px flex-1 bg-line"></span>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          {#each BRANCH_B as entry (entry.step)}{@render stepLink(entry)}{/each}
          <span class="text-xs text-muted">{$t("exam.sidebar.insteadOfA")}</span>
        </div>
      </div>
    </li>
    {#each AFTER as entry (entry.step)}
      <li class="flex min-w-0 items-center gap-1">
        {@render arrow()}
        {@render stepLink(entry)}
      </li>
    {/each}
  </ol>
{/if}
