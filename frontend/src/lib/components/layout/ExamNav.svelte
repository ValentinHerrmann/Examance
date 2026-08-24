<script lang="ts">
  import type { ExamRecord } from "$lib/db/schema";
  import { formatExamCourse } from "$lib/utils/examLabel";
  import { t } from "$lib/i18n";

  export let exam: ExamRecord;
  export let examId: string;
  export let submissionCount: number;
  export let isSetupActive: boolean;
  export let isScanActive: boolean;
  export let isVerifyActive: boolean = false;
  export let isGradeActive: boolean;
  export let isManualActive: boolean = false;
  export let isStatsActive: boolean;

  $: tabs = [
    { href: `/exam/${examId}`, label: $t("exam.nav.tabs.setup"), active: isSetupActive },
    {
      href: `/exam/${examId}/scan`,
      label: $t("exam.nav.tabs.scan", { count: submissionCount }),
      active: isScanActive,
    },
    { href: `/exam/${examId}/verify`, label: $t("exam.nav.tabs.verify"), active: isVerifyActive },
    { href: `/exam/${examId}/grade`, label: $t("exam.nav.tabs.grade"), active: isGradeActive },
    { href: `/exam/${examId}/manual`, label: $t("exam.nav.tabs.manual"), active: isManualActive },
    {
      href: `/exam/${examId}/stats`,
      label: $t("exam.nav.tabs.stats"),
      active: isStatsActive,
      highlight: true,
    },
  ];
</script>

<div class="flex shrink-0 flex-wrap items-start justify-between gap-x-4 gap-y-1">
  <div class="min-w-0">
    <h2 class="m-0 mb-0.5 text-lg font-bold break-words text-accent sm:text-xl">
      {exam.title || $t("exam.nav.examFallback")}
    </h2>
    <span class="text-xs text-muted sm:text-sm">
      {exam.testart || "Kurzarbeit"} | {$t("common.className")}: {formatExamCourse(
        exam.grade,
        exam.klasse,
      ) || "-"} | {$t("common.subject")}: {exam.fach || "-"} | {$t("common.date")}: {exam.datum ||
        "-"}
    </span>
  </div>
  <a
    href="/"
    class="shrink-0 text-sm font-medium text-muted no-underline hover:text-accent"
  >
    {$t("exam.nav.backToDashboard")}
  </a>
</div>

<!-- The tab strip scrolls sideways rather than squeezing six labels into a
     phone's width; `flex-1` only kicks in once they all fit. -->
<nav
  class="scroll-pane mt-2 mb-2 flex shrink-0 snap-x snap-mandatory gap-1.5 overflow-x-auto rounded-lg border border-line bg-surface-raised p-1"
  aria-label={$t("exam.nav.tabsLabel")}
>
  {#each tabs as tab (tab.href)}
    <a
      href={tab.href}
      aria-current={tab.active ? "page" : undefined}
      class="shrink-0 snap-start rounded-md px-3 py-2 text-center text-sm font-medium whitespace-nowrap no-underline transition-colors lg:flex-1
        {tab.active
        ? 'bg-accent-strong font-semibold text-white'
        : tab.highlight
          ? 'text-accent hover:bg-accent-strong/20'
          : 'text-slate-300 hover:bg-surface-inset hover:text-white'}"
    >
      {tab.label}
    </a>
  {/each}
</nav>
