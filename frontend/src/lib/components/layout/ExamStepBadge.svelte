<script lang="ts">
  import { faCheck } from "@fortawesome/free-solid-svg-icons";
  import type { StepStatus } from "#lib/exam/examProgress";
  import { Badge, Icon } from "#lib/components/ui";
  import { t, type TranslationKey } from "#lib/i18n";
  import type { ExamStep } from "./examNavItems";

  /** A step's status in the exam sidebar, drawer and exam-list cards: an attention count, a count (or x/y), or a check when done without a count. */
  interface Props {
    status: StepStatus | undefined;
    /** Names what the number counts (hover title); without it the badge has no title. */
    step?: ExamStep;
  }

  let { status, step }: Props = $props();

  const badgeKeys: Partial<Record<ExamStep, TranslationKey>> = {
    content: "exam.sidebar.badge.content",
    students: "exam.sidebar.badge.students",
    scan: "exam.sidebar.badge.scan",
    verify: "exam.sidebar.badge.verify",
    grade: "exam.sidebar.badge.grade",
    results: "exam.sidebar.badge.results",
  };
  let title = $derived(
    step && status && badgeKeys[step] && status.count !== undefined
      ? $t(step === "verify" && status.total !== undefined ? "exam.sidebar.badge.verifySure" : badgeKeys[step], { count: status.count, total: status.total ?? 0 })
      : status?.done
        ? $t("exam.sidebar.badge.done")
        : undefined,
  );
</script>

{#if status}
  {#if status.alert}
    <Badge size="xs" severity="danger" title={$t("sharing.delivery.badge", { count: status.alert })}>{status.alert}</Badge>
  {:else if status.count !== undefined && status.total !== undefined}
    <Badge size="xs" severity={status.done ? "success" : "secondary"} {title}>{status.count}/{status.total}</Badge>
  {:else if status.count !== undefined && status.count > 0}
    <Badge size="xs" severity={status.done ? "success" : "secondary"} {title}>{status.count}</Badge>
  {:else if status.done}
    <span {title}><Icon icon={faCheck} class="text-xs text-success-fg" /></span>
    <span class="sr-only">{$t("exam.flow.done")}</span>
  {/if}
{/if}
