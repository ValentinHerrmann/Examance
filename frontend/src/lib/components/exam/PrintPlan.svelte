<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { faArrowsRotate, faCircleCheck, faCircleInfo, faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
  import { downloadBlob } from "#lib/components/stats/chartExport";
  import InfoTip from "#lib/components/help/InfoTip.svelte";
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
  import { imposeBooklet } from "#lib/qr/booklet";
  import { slug } from "#lib/export/zip";
  import { spotChoices, stickersPerCopy, type PrintSettings } from "#lib/exam/printLayout";
  import type { ExamLayoutPatch } from "#lib/exam/saveExamLayout";
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
    /** Compiles the task sheet and, unless `solution: false`, the solution (the preview beside the plan shows them). */
    compile: ((opts?: { solution?: boolean }) => Promise<void>) | undefined;
    /** The exam's multi-sheet layout (issue #220): page codes, duplex or booklet, sticker box per sheet. */
    print: PrintSettings;
    /** Saves a print setting on the exam (mode, layout, sticker spots); the sheet follows it. */
    onPrintChange: (patch: ExamLayoutPatch) => Promise<void>;
    /** A sticker or copies PDF was made (or dropped): the page shows it as an extra preview pane. */
    onJobPdf: (job: PrintJobId, url: string | null) => void;
    class?: string;
  }

  let { examId, examTitle, exerciseCount, entries, entriesError, preview, hasMc, copiesUnavailable, loadExamPdf, downloadPdf, compile, print, onPrintChange, onJobPdf, class: className = "" }: Props = $props();

  let cs = $derived($examChecksState && $examChecksState.examId === examId ? $examChecksState : null);
  let stamps = $derived(cs?.stamps ? printStamps(cs.stamps.content, cs.stamps.students) : null);
  let plan = $derived<PrintPlan>(cs?.checks.printPlan ?? DEFAULT_PRINT_PLAN);
  let jobs = $derived(printJobs(plan, print.mode));
  let busy = $state(false);
  let error = $state("");

  let pdfCurrent = $derived(preview?.pdf === "current");
  let solutionCurrent = $derived(preview?.solution === "current");
  let booklet = $derived(print.layout === "booklet" ? (plan.booklet ?? "impose") : null);
  // How to print and fold.
  let howTo = $derived<"bookletImpose" | "bookletPrinter" | "duplex">(booklet === "impose" ? "bookletImpose" : booklet === "printer" ? "bookletPrinter" : "duplex");
  // Stickers per student follow the compiled sheet's page count when every sheet has a box.
  let pageCount = $state(0);
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
    if (print.mode === "copies" && copiesUnavailable) rows.push({ level: "warn", text: copiesUnavailable });
    return rows;
  });
  const levelIcon = { ok: faCircleCheck, warn: faTriangleExclamation, info: faCircleInfo };
  const levelClass = { ok: "text-success-fg", warn: "text-warning-fg", info: "text-muted" };

  /** Whether the job's PDF exists for the current content: the compiled preview for the sheets, a made PDF for the QR jobs. */
  function made(job: PrintJobId): boolean {
    if (job === "exam") return pdfCurrent;
    if (job === "solution") return solutionCurrent;
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

  // The made sticker or copies PDF, kept for its download; the page previews it.
  type SavedFile = { bytes: Uint8Array; fileName: string; type: string };
  let jobPdf = $state.raw<Partial<Record<PrintJobId, { url: string; bytes: Uint8Array; fileName: string; download?: SavedFile }>>>({});
  let creators = $state<Partial<Record<PrintJobId, () => Promise<void>>>>({});

  let preparing = $state(false);

  /** The one action of the Print step: compiles what the plan prints (the solution only when it is printed; unchanged sources come from the compile cache), then makes the sticker or copies PDF unless the current one is still valid. */
  async function prepare() {
    if (preparing) return;
    preparing = true;
    error = "";
    try {
      if (compile && (!pdfCurrent || (plan.solution && !solutionCurrent))) await compile({ solution: plan.solution });
      for (const job of jobs) {
        if ((job === "qr" || job === "copies") && !(made(job) && jobPdf[job])) await creators[job]?.(); // NOSONAR: one PDF at a time
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      preparing = false;
    }
  }

  function gotPdf(job: PrintJobId, pdf: Uint8Array, fileName: string, download?: SavedFile) {
    const old = jobPdf[job];
    if (old) URL.revokeObjectURL(old.url);
    const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }));
    jobPdf = { ...jobPdf, [job]: { url, bytes: pdf, fileName, download } };
    onJobPdf(job, url);
    recordMade(job);
  }

  function downloadJob(job: PrintJobId) {
    const made = jobPdf[job];
    if (!made) return;
    const file = made.download ?? { bytes: made.bytes, fileName: made.fileName, type: "application/pdf" };
    downloadBlob(new Blob([file.bytes as BlobPart], { type: file.type }), file.fileName);
  }

  /** The plain task sheet; for a booklet Examance imposes, one A3 booklet the teacher prints as often as needed. */
  async function downloadSheet(job: "exam" | "solution") {
    if (job === "solution" || booklet !== "impose") return downloadPdf(job === "exam" ? "angabe" : "loesung");
    // Plain sheets fill whole sheets themselves (filler pages); a booklet needs a multiple of 4.
    const pdf = await loadExamPdf();
    const lib = await import("pdf-lib");
    const pages = (await lib.PDFDocument.load(pdf)).getPageCount();
    downloadBlob(new Blob([(await imposeBooklet(pdf, pages)) as BlobPart], { type: "application/pdf" }), `${slug(examTitle || "exam")}_booklet.pdf`);
  }

  onDestroy(() => {
    for (const made of Object.values(jobPdf)) if (made) URL.revokeObjectURL(made.url);
  });

  const setPlan = (patch: Partial<PrintPlan>) => cs && save(withPrintPlan(cs.checks, { ...plan, ...patch }));
  let saving = $state(false);
  async function change(patch: ExamLayoutPatch) {
    saving = true;
    error = "";
    try {
      await onPrintChange(patch);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      saving = false;
    }
  }
  const tick = (job: PrintJobId, on: boolean) => cs && stamps && save(withPrintCheck(cs.checks, job, on ? stamps[job] : null));
  const recordMade = (job: PrintJobId) => {
    if (cs && stamps && !printMadeValid(cs.checks, job, stamps)) void save(withPrintMade(cs.checks, job, stamps[job]));
  };

  let countedFor = "";
  $effect.pre(() => {
    const want = print.mode === "stickers" && print.stickerSpots !== "cover" && pdfCurrent;
    const at = preview?.pdf ?? "";
    untrack(() => {
      if (!want || countedFor === at) return;
      countedFor = at;
      void loadExamPdf()
        .then(async (pdf) => (await import("pdf-lib")).PDFDocument.load(pdf))
        .then((doc) => (pageCount = doc.getPageCount()))
        .catch(() => (pageCount = 0));
    });
  });
</script>

<div class="flex min-w-0 flex-col gap-4 {className}">
  <Card>
    <div class="mb-3 flex items-center gap-2">
      <h2 class="m-0 text-base font-semibold text-content">{$t("exam.print.planTitle")}</h2>
      <InfoTip text={$t("exam.print.planIntro")} />
    </div>
    <div class="grid grid-cols-1 gap-4 2xl:grid-cols-2">
      <fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" disabled={busy || saving || !cs}>
        <legend class="mb-2 text-sm font-medium">{$t("exam.print.modeLegend")}</legend>
        <!-- Only the chosen mode shows its description (the other on hover). Mode, layout and spots shape the sheet, so they live on the exam (issue #220). -->
        <div title={print.mode === "stickers" ? undefined : $t("exam.print.modeStickersHint")}>
          <Radio group={print.mode} value="stickers" name="print-mode" onchange={() => change({ printMode: "stickers" })} label={$t("exam.print.modeStickers")} />
          {#if print.mode === "stickers"}<p class="m-0 ms-7 text-xs text-muted">{$t("exam.print.modeStickersHint")}</p>{/if}
        </div>
        <div title={print.mode === "copies" ? undefined : (copiesUnavailable ?? $t("exam.print.modeCopiesHint"))}>
          <Radio group={print.mode} value="copies" name="print-mode" disabled={!!copiesUnavailable} onchange={() => change({ printMode: "copies" })} label={$t("exam.print.modeCopies")} />
          {#if print.mode === "copies" || copiesUnavailable}<p class="m-0 ms-7 text-xs text-muted">{copiesUnavailable ?? $t("exam.print.modeCopiesHint")}</p>{/if}
        </div>

        <span class="mt-2 text-sm font-medium">{$t("exam.print.layoutLegend")}</span>
        <div class="flex flex-wrap gap-x-4 gap-y-1">
          <Radio group={print.layout} value="duplex" name="print-layout" onchange={() => change({ printLayout: "duplex" })} label={$t("exam.print.duplex")} />
          <Radio group={print.layout} value="booklet" name="print-layout" onchange={() => change({ printLayout: "booklet" })} label={$t("exam.print.booklet.label")} />
        </div>
        {#if booklet}
          <div class="ms-7 flex flex-col gap-1">
            <span class="text-xs text-muted">{$t("exam.print.booklet.legend")}</span>
            <Radio group={booklet} value="impose" name="print-booklet" onchange={() => setPlan({ booklet: "impose" })} label={$t("exam.print.booklet.impose")} />
            <Radio group={booklet} value="printer" name="print-booklet" onchange={() => setPlan({ booklet: "printer" })} label={$t("exam.print.booklet.printer")} />
          </div>
        {/if}

        {#if print.mode === "stickers"}
          <span class="mt-2 text-sm font-medium">{$t("exam.print.spots.legend")}</span>
          {#each spotChoices(print.layout) as spot (spot)}
            <Radio group={print.stickerSpots} value={spot} name="print-spots" onchange={() => change({ stickerSpots: spot })} label={$t(`exam.print.spots.${spot}`)} />
          {/each}
        {/if}

        <Checkbox class="mt-2" checked={plan.solution} disabled={busy || !cs} onChange={(on) => setPlan({ solution: on })} label={$t("exam.print.withSolution")} />
        <p class="m-0 mt-1 text-xs text-muted">{$t(`exam.print.howTo.${howTo}`)}</p>
        <Button class="mt-2 self-start" icon={faArrowsRotate} loading={preparing || !!preview?.busy} disabled={preparing || !!preview?.busy || !compile} onClick={prepare}>{$t("exam.print.prepare")}</Button>
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

  <!-- Every job works the same way: header with its icon actions (make or refresh, download), options, then the "printed" tick (issue #212). -->
  <ol class="m-0 flex list-none flex-col gap-3 p-0">
    {#each jobs as job, i (job)}
      {@const valid = !!stamps && printCheckValid(cs?.checks, job, stamps)}
      {@const changed = !!stamps && printCheckChanged(cs?.checks, job, stamps)}
      {@const canTick = valid || made(job)}
      {@const sheet = job === "exam" || job === "solution"}
      <li class="flex min-w-0 flex-col gap-3 rounded-xl border bg-surface-raised p-4 {valid ? 'border-success' : 'border-line'}">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0 flex-1">
            <h3 class="m-0 text-base font-semibold"><span class="me-1.5 text-muted tabular-nums">{i + 1}.</span>{$t(`exam.print.job.${job}`)}</h3>
            <p class="m-0 mt-0.5 text-sm text-muted">
              {#if job === "exam"}{studentCount > 0 ? $t("exam.print.job.examHint", { count: studentCount }) : $t("exam.print.job.examHintNoCount")}{:else}{$t(`exam.print.job.${job}Hint`)}{/if}
            </p>
          </div>
          <div class="flex shrink-0 items-center gap-1">
            {#if sheet}
              <Button size="sm" variant="outlined" severity="secondary" iconOnly icon={actionIcons.download} disabled={!made(job)} ariaLabel={$t("exam.print.job.download")} title={$t("exam.print.job.download")} onClick={() => downloadSheet(job === "exam" ? "exam" : "solution")} />
            {:else}
              <Button size="sm" variant="outlined" severity="secondary" iconOnly icon={actionIcons.download} disabled={!jobPdf[job]} ariaLabel={$t("exam.print.job.download")} title={$t("exam.print.job.download")} onClick={() => downloadJob(job)} />
            {/if}
          </div>
        </div>

        {#if !sheet}
          {#if job === "copies" && copiesUnavailable}
            <p class="m-0 text-sm text-warning-fg">{copiesUnavailable}</p>
          {:else if entries}
            <StickerSheetForm
              {examId}
              {examTitle}
              {entries}
              output={job === "copies" ? "copies" : "stickers"}
              loadExamPdf={job === "copies" ? loadExamPdf : undefined}
              booklet={job === "copies" ? booklet : null}
              stickersPerStudent={stickersPerCopy(print, pageCount)}
              bind:create={creators[job]}
              onPdf={(pdf, _kind, fileName, download) => gotPdf(job, pdf, fileName, download)}
            />
          {/if}
        {/if}

        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3">
          <Checkbox checked={valid} disabled={busy || !stamps || !canTick} onChange={(on) => tick(job, on)} label={$t("exam.print.job.printed")} />
          {#if valid}
            <Badge size="xs" severity="success">{$t("exam.print.job.printedAt", { date: $fmt.dateTime(cs?.checks.print?.[job]?.at ?? "") })}</Badge>
          {:else if changed}
            <span class="text-xs text-warning-fg">{$t("exam.print.job.changed")}</span>
          {:else if !canTick}
            <span class="text-xs text-muted">{$t("exam.print.job.needsPdf")}</span>
          {/if}
        </div>
      </li>
    {/each}
  </ol>
</div>
