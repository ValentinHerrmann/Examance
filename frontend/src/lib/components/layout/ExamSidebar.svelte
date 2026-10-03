<script lang="ts">
  import { faAnglesLeft, faAnglesRight, faArrowLeft } from "@fortawesome/free-solid-svg-icons";
  import { t } from "$lib/i18n";
  import { formatExamCourse } from "$lib/utils/examLabel";
  import { minWidth } from "$lib/stores/viewport";
  import { sidebarPreference, setSidebarCollapsed, type ExamNavContext } from "$lib/stores/shell";
  import { Badge, Icon, Tooltip } from "$lib/components/ui";
  import { examNavItems } from "./examNavItems";

  /**
   * Exam navigation (Artemis course sidebar): exam context, the exam's steps, a collapse toggle (64px rail).
   * Shown from `lg`; below that the items live in the nav drawer. Without a saved preference: rail at `lg` and on
   * the grade page, open from `xl`.
   */
  interface Props {
    context: ExamNavContext;
    pathname: string;
    isGradeActive?: boolean;
  }

  let { context, pathname, isGradeActive = false }: Props = $props();

  const isXl = minWidth("xl", true);

  let collapsed =
    $derived($sidebarPreference === "collapsed" ||
    ($sidebarPreference === null && (!$isXl || isGradeActive)));

  let items = $derived(examNavItems(context.examId, pathname));
  let exam = $derived(context.exam);
  let course = $derived(exam ? formatExamCourse(exam.grade, exam.klasse) : "");
  let metaLines = $derived(exam ? [exam.testart, [course, exam.fach].filter(Boolean).join(", "), exam.datum].filter(Boolean) : []);
</script>

<aside
  class="hidden shrink-0 flex-col border-r border-line bg-surface-raised transition-[width] duration-200 motion-reduce:transition-none lg:flex {collapsed
    ? 'w-16'
    : 'w-41'}"
  aria-label={$t("exam.sidebar.label")}
>
  <div class="flex flex-col gap-2 border-b border-line px-2 py-3">
    <Tooltip text={$t("exam.sidebar.back")} placement="right" disabled={!collapsed} wrapperClass="flex w-full">
      <a
        href="/"
        class="flex min-h-9 w-full items-center gap-2 rounded-md px-3 text-sm text-muted no-underline hover:bg-surface-inset hover:text-content pointer-coarse:min-h-11"
        aria-label={collapsed ? $t("exam.sidebar.back") : undefined}
      >
        <Icon icon={faArrowLeft} class="w-4" />
        {#if !collapsed}<span class="truncate">{$t("exam.sidebar.back")}</span>{/if}
      </a>
    </Tooltip>
    {#if !collapsed && exam}
      <div class="min-w-0 px-3">
        {#each metaLines as line}
          <p class="m-0 truncate text-xs text-muted" title={line}>{line}</p>
        {/each}
      </div>
    {/if}
  </div>

  <nav class="scroll-pane min-h-0 flex-1 overflow-y-auto py-2" aria-label={$t("exam.sidebar.label")}>
    <ul class="m-0 flex list-none flex-col gap-0.5 p-0 px-2">
      {#each items as item (item.step)}
        <li>
          <Tooltip text={$t(item.labelKey)} placement="right" disabled={!collapsed} wrapperClass="flex w-full">
            <a
              href={item.href}
              aria-current={item.active ? "page" : undefined}
              aria-label={collapsed ? $t(item.labelKey) : undefined}
              class="relative flex min-h-10 w-full items-center gap-3 rounded-md px-3 text-sm font-medium no-underline pointer-coarse:min-h-11 {item.active
                ? 'bg-highlight text-on-highlight before:absolute before:inset-y-1.5 before:left-0 before:w-0.75 before:rounded-full before:bg-primary'
                : 'text-muted hover:bg-surface-inset hover:text-content'}"
            >
              <Icon icon={item.icon} class="w-4 text-base" />
              {#if !collapsed}
                <span class="min-w-0 flex-1 truncate">{$t(item.labelKey)}</span>
                {#if item.step === "scan" && context.submissionCount > 0}
                  <Badge size="xs" severity="secondary">{context.submissionCount}</Badge>
                {/if}
              {/if}
            </a>
          </Tooltip>
        </li>
      {/each}
    </ul>
  </nav>

  <div class="border-t border-line p-2">
    <button
      type="button"
      class="flex min-h-9 w-full cursor-pointer items-center gap-2 rounded-md border-0 bg-transparent px-3 text-sm text-muted hover:bg-surface-inset hover:text-content pointer-coarse:min-h-11 {collapsed
        ? 'justify-center'
        : ''}"
      aria-expanded={!collapsed}
      aria-label={collapsed ? $t("exam.sidebar.expand") : $t("exam.sidebar.collapse")}
      title={collapsed ? $t("exam.sidebar.expand") : $t("exam.sidebar.collapse")}
      onclick={() => setSidebarCollapsed(!collapsed)}
    >
      <Icon icon={collapsed ? faAnglesRight : faAnglesLeft} />
      {#if !collapsed}<span class="truncate">{$t("exam.sidebar.collapse")}</span>{/if}
    </button>
  </div>
</aside>
