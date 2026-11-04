<script lang="ts">
  import { faCircleCheck, faCircleInfo, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { fmt } from "#lib/utils/format";
  import { contentHref, studentsHref } from "#lib/utils/links";
  import { examChecksState } from "#lib/stores/shell";
  import { saveExamChecks } from "#lib/exam/examChecksService";
  import {
    DEFAULT_PRINT_PLAN,
    printCheckChanged,
    printCheckValid,
    printJobs,
    printMadeValid,
    printStamps,
    withPrintCheck,
    withPrintMade,
    withPrintPlan,
    type PrintJobId,
    type PrintPlan,
  } from "#lib/exam/examChecks";
  import type { StickerEntry } from "#lib/qr/stickerSheet";
  import type { ExamPreviewStatus } from "#lib/components/exam/ExamPreviewPanel.svelte";
  import StickerSheetForm from "#lib/components/sharing/StickerSheetForm.svelte";
  import { Alert, Badge, Button, Card, Checkbox, Icon, Radio, actionIcons } from "#lib/components/ui";

  /** The Print step (issue #212): the teacher picks how they print, the page lists the print jobs that follow, each with its readiness, its PDF and a "printed" tick that is only offered once that PDF exists for the current content. */
  interface Props {
    examId: string;
    examTitle: string;
    exerciseCount: number;
    /** The exam's students; null while loading. */
    entries: StickerEntry[] | null;
    entriesError: string;
    preview: ExamPreviewStatus | undefined;
    hasMc: boolean;
    /** Why personalised copies cannot be made, or null. */
    copiesUnavailable: string | null;
    /** The current task sheet (personalised copies are made from it). */
    loadExamPdf: () => Promise<Uint8Array>;
    downloadPdf: (variant: "angabe" | "loesung") => Promise<void>;
  }

  let { examId, examTitle, exerciseCount, entries, entriesError, preview, hasMc, copiesUnavailable, loadExamPdf, downloadPdf }: Props = $props();

  let cs = $derived($examChecksState && $examChecksState.examId === examId ? $examChecksState : null);
  let stamps = $derived(cs?.stamps ? printStamps(cs.stamps.content, cs.stamps.students) : null);
  let plan = $derived<PrintPlan>(cs?.checks.printPlan ?? DEFAULT_PRINT_PLAN);
  let jobs = $derived(printJobs(plan));
  let busy = $state(false);
  let error = $state("");

  let pdfCurrent = $derived(preview?.pdf === "current");
  let studentCount = $derived(entries?.length ?? 0);

  type Level = "ok" | "warn" | "info";
  let readiness = $derived.by(() => {
    const rows: { level: Level; text: string; href?: string }[] = [];
    rows.push(exerciseCount > 0 ? { level: "ok", text: $t("exam.print.ready.exercises", { count: exerciseCount }) } : { level: "warn", text: $t("exam.print.ready.noExercises"), href: contentHref(examId) });
    if (entriesError) rows.push({ level: "warn", text: $t("exam.print.ready.studentsFailed") });
    else if (entries) rows.push(studentCount > 0 ? { level: "ok", text: $t("exam.print.ready.students", { count: studentCount }) } : { level: "warn", text: $t("exam.print.ready.noStudents"), href: studentsHref(examId) });
    if (preview) {
      rows.push(preview.pdf === "current" ? { level: "ok", text: $t("exam.print.ready.pdfCurrent") } : { level: preview.pdf === "stale" ? "warn" : "info", text: $t(preview.pdf === "stale" ? "exam.print.ready.pdfStale" : "exam.print.ready.pdfNone") });
      if (hasMc) {
        const omr = { ready: "omrReady", stale: "omrStale", none: "omrNone", checking: "omrChecking" } as const;
        rows.push({ level: preview.omr === "ready" ? "ok" : preview.omr === "stale" ? "warn" : "info", text: $t(`exam.print.ready.${omr[preview.omr]}`) });
      }
    }
    if (plan.mode === "copies" && copiesUnavailable) rows.push({ level: "warn", text: copiesUnavailable });
    return rows;
  });
  const levelIcon = { ok: faCircleCheck, warn: faTriangleExclamation, info: faCircleInfo };
  const levelClass = { ok: "text-success-fg", warn: "text-warning-fg", info: "text-muted" };

  /** Whether the job's PDF exists for the current content: the compiled preview for the sheets, a made PDF for the QR jobs. */
  function made(job: PrintJobId): boolean {
    if (job === "exam" || job === "solution") return pdfCurrent;
    return !!stamps && printMadeValid(cs?.checks, job, stamps);
  }

  async function save(next: Parameters<typeof saveExamChecks>[1]) {
    busy = true;
    error = "";
    try {
      await saveExamChecks(examId, next);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      busy = false;
    }
  }

  const setPlan = (patch: Partial<PrintPlan>) => cs && save(withPrintPlan(cs.checks, { ...plan, ...patch }));
  const tick = (job: PrintJobId, on: boolean) => cs && stamps && save(withPrintCheck(cs.checks, job, on ? stamps[job] : null));
  const recordMade = (job: PrintJobId) => {
    if (cs && stamps && !printMadeValid(cs.checks, job, stamps)) void save(withPrintMade(cs.checks, job, stamps[job]));
  };
</script>

<div class="flex min-w-0 flex-col gap-6">
  <Card title={$t("exam.print.planTitle")}>
    <p class="mt-0 mb-4 text-sm text-muted">{$t("exam.print.planIntro")}</p>
    <div class="grid grid-cols-1 gap-6 2xl:grid-cols-2">
      <fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" disabled={busy || !cs}>
        <legend class="mb-2 text-sm font-medium">{$t("exam.print.modeLegend")}</legend>
        <div>
          <Radio group={plan.mode} value="stickers" name="print-mode" onchange={() => setPlan({ mode: "stickers" })} label={$t("exam.print.modeStickers")} />
          <p class="m-0 ms-7 text-xs text-muted">{$t("exam.print.modeStickersHint")}</p>
        </div>
        <div>
          <Radio group={plan.mode} value="copies" name="print-mode" disabled={!!copiesUnavailable} onchange={() => setPlan({ mode: "copies" })} label={$t("exam.print.modeCopies")} />
          <p class="m-0 ms-7 text-xs text-muted">{copiesUnavailable ?? $t("exam.print.modeCopiesHint")}</p>
        </div>
        <Checkbox class="mt-2" checked={plan.solution} disabled={busy || !cs} onChange={(on) => setPlan({ solution: on })} label={$t("exam.print.withSolution")} />
      </fieldset>

      <section class="min-w-0" aria-labelledby="print-ready-title">
        <h3 id="print-ready-title" class="m-0 mb-2 text-sm font-medium">{$t("exam.print.ready.title")}</h3>
        <ul class="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
          {#each readiness as row (row.text)}
            <li class="flex items-start gap-2">
              <Icon icon={levelIcon[row.level]} class="mt-0.5 w-4 shrink-0 {levelClass[row.level]}" />
              {#if row.href}<a href={row.href} class="text-content">{row.text}</a>{:else}<span>{row.text}</span>{/if}
            </li>
          {/each}
        </ul>
      </section>
    </div>
    {#if !cs || !stamps}<Alert severity="info" class="mt-4">{$t("exam.print.unavailable")}</Alert>{/if}
    {#if error}<Alert severity="danger" class="mt-4">{error}</Alert>{/if}
  </Card>

  <ol class="m-0 flex list-none flex-col gap-4 p-0">
    {#each jobs as job, i (job)}
      {@const valid = !!stamps && printCheckValid(cs?.checks, job, stamps)}
      {@const changed = !!stamps && printCheckChanged(cs?.checks, job, stamps)}
      {@const canTick = valid || made(job)}
      <li class="min-w-0 rounded-xl border border-line bg-surface-raised p-4 {valid ? 'border-success' : ''}">
        <div class="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div class="min-w-0">
            <h3 class="m-0 text-base font-semibold"><span class="me-1.5 text-muted tabular-nums">{i + 1}.</span>{$t(`exam.print.job.${job}`)}</h3>
            <p class="m-0 mt-0.5 text-sm text-muted">
              {#if job === "exam"}{studentCount > 0 ? $t("exam.print.job.examHint", { count: studentCount }) : $t("exam.print.job.examHintNoCount")}{:else}{$t(`exam.print.job.${job}Hint`)}{/if}
            </p>
          </div>
          <div class="flex flex-col items-end gap-1">
            <Checkbox checked={valid} disabled={busy || !stamps || !canTick} onChange={(on) => tick(job, on)} label={$t("exam.print.job.printed")} />
            {#if valid}
              <Badge size="xs" severity="success">{$t("exam.print.job.printedAt", { date: $fmt.date(cs?.checks.print?.[job]?.at ?? "") })}</Badge>
            {:else if !canTick}
              <span class="text-xs text-muted">{changed ? $t("exam.print.job.needsFresh") : $t("exam.print.job.needsPdf")}</span>
            {/if}
          </div>
        </div>
        {#if changed}<Alert severity="warning" class="mt-3">{$t("exam.print.job.changed")}</Alert>{/if}

        <div class="mt-3">
          {#if job === "exam" || job === "solution"}
            <Button
              size="sm"
              variant="outlined"
              severity="secondary"
              icon={actionIcons.download}
              disabled={!pdfCurrent}
              onClick={() => downloadPdf(job === "exam" ? "angabe" : "loesung")}
            >
              {job === "exam" ? $t("exam.print.job.download") : $t("exam.print.job.downloadSolution")}
            </Button>
          {:else if job === "copies" && copiesUnavailable}
            <Alert severity="warning">{copiesUnavailable}</Alert>
          {:else if job === "copies" && !pdfCurrent}
            <p class="m-0 text-sm text-muted">{$t(preview?.pdf === "stale" ? "exam.print.ready.pdfStale" : "exam.print.ready.pdfNone")}</p>
          {:else if entries}
            <StickerSheetForm
              {examId}
              {examTitle}
              {entries}
              output={job === "copies" ? "copies" : "stickers"}
              loadExamPdf={job === "copies" ? loadExamPdf : undefined}
              onDone={(kind) => {
                if (kind !== "keys") recordMade(job);
              }}
            />
          {/if}
        </div>
      </li>
    {/each}
  </ol>
</div>
