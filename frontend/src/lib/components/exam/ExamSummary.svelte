<script lang="ts">
  import type { Snippet } from "svelte";
  import type { ExamRecord, ExerciseRecord } from "#lib/db/schema";
  import type { LazyEntry } from "#lib/utils/lazyMap";
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { formatExamCourse } from "#lib/utils/examLabel";
  import { Badge, LinkButton } from "#lib/components/ui";
  import LogoPreview from "#lib/components/logo/LogoPreview.svelte";
  import type { ExamLogoPreview, LogoSource } from "#lib/latex/logo";
  import type { TranslationKey } from "#lib/i18n";

  export interface ExamBadgeStats {
    avgScore: number | null;
    count: number;
  }

  interface Props {
    exam: ExamRecord;
    /** "badges" renders only the header badges (for ExpandableCard's badges slot). */
    part?: "badges" | "body";
    stats?: ExamBadgeStats | undefined;
    /** Undefined = not requested yet (shown as loading). */
    exercises?: LazyEntry<ExerciseRecord[]> | undefined;
    logo?: LazyEntry<ExamLogoPreview> | undefined;
    /** Without it exercise names are plain text. */
    onOpenExercise?: (ex: ExerciseRecord) => void;
    /** Step buttons etc.; omitted in the read-only modal. */
    actions?: Snippet;
  }

  let { exam, part = "body", stats = undefined, exercises: used, logo, onOpenExercise, actions }: Props = $props();

  const SOURCE_LABEL = {
    default: "logo.source.default",
    account: "logo.source.account",
    exam: "logo.source.exam",
    none: "logo.source.none",
  } as const satisfies Record<LogoSource, TranslationKey>;
</script>

{#if part === "badges"}
  {@const courseLabel = formatExamCourse(exam.grade, exam.klasse)}
  {#if courseLabel}
    <Badge severity="info">{$t("dashboard.examList.classLabel", { course: courseLabel })}</Badge>
  {/if}
  {#if exam.fach}
    <Badge severity="success">{exam.fach}</Badge>
  {/if}
  {#if exam.testart}
    <Badge>{exam.testart}</Badge>
  {/if}
  {#if exam.topic}
    <Badge title={exam.topic}>{exam.topic}</Badge>
  {/if}
  {#if stats && stats.avgScore !== null}
    <Badge severity="primary">{$t("dashboard.examList.averageScore", { score: stats.avgScore })}</Badge>
  {/if}
  {#if stats && stats.count > 0}
    <Badge severity="secondary">{$t("dashboard.examList.gradedCount", { count: stats.count })}</Badge>
  {/if}
{:else}

<div class="flex flex-wrap gap-x-6 gap-y-1 text-sm text-content">
  {#if exam.datum}
    <span>{$t("dashboard.examList.dateLabel", { date: exam.datum })}</span>
  {:else if exam.createdAt}
    <span>{$t("dashboard.examList.dateLabel", { date: $fmt.date(exam.createdAt) })}</span>
  {/if}
  {#if exam.numVersions && exam.numVersions > 1}
    <span>{$t("dashboard.examList.versionsCount", { count: exam.numVersions })}</span>
  {/if}
</div>
{#if exam.retentionUntil}
  <p class="m-0 mt-1 text-xs text-muted">{$t("dashboard.examList.retentionUntil", { date: exam.retentionUntil })}</p>
{/if}

<div class="mt-3">
  <h4 class="m-0 mb-2 text-sm font-semibold text-content">{$t("logo.overviewLabel")}</h4>
  {#if logo === undefined || logo.status === "loading"}
    <p class="m-0 text-sm text-muted">{$t("common.loading")}</p>
  {:else if logo.status === "error"}
    <p class="m-0 text-sm text-danger-fg">{$t("common.loadFailedShort")}</p>
  {:else}
    <div class="flex flex-wrap items-center gap-3">
      <LogoPreview size="sm" bytes={logo.value.bytes} mime={logo.value.info.mime_type} />
      <span class="text-sm text-muted">{$t(SOURCE_LABEL[logo.value.info.source])}</span>
    </div>
  {/if}
</div>

<div class="mt-3">
  <h4 class="m-0 mb-2 text-sm font-semibold text-content">{$t("dashboard.examList.exercisesTitle")}</h4>
  {#if used === undefined || used.status === "loading"}
    <p class="m-0 text-sm text-muted">{$t("dashboard.examList.loadingExercises")}</p>
  {:else if used.status === "error"}
    <p class="m-0 text-sm text-danger-fg">{$t("common.loadFailedShort")}</p>
  {:else if used.value.length === 0}
    <p class="m-0 text-sm text-muted">{$t("dashboard.examList.noExercises")}</p>
  {:else}
    <ol class="m-0 flex list-none flex-col gap-1 p-0">
      {#each used.value as ex, i (ex.id)}
        {@const name = ex.title || ex.name || $t("dashboard.examList.untitledExercise")}
        <li class="flex min-w-0 flex-wrap items-center gap-2 text-sm text-content">
          <span class="w-6 shrink-0 text-right text-muted">{i + 1}.</span>
          {#if onOpenExercise}
            <LinkButton onClick={() => onOpenExercise(ex)}>{name}</LinkButton>
          {:else}
            <span class="min-w-0 break-words">{name}</span>
          {/if}
          <Badge>v{ex.version ?? 1}</Badge>
          {#if ex.variantKey && ex.variantKey !== "_General"}
            <Badge severity="info">{ex.variantKey}</Badge>
          {/if}
        </li>
      {/each}
    </ol>
  {/if}
</div>

{#if actions}
  <div class="mt-3 flex flex-wrap gap-2">
    {@render actions()}
  </div>
{/if}
{/if}
