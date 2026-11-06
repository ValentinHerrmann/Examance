<script lang="ts" module>
  /** The panes of the Print step's preview. */
  export interface PrintPreviews {
    angabe: boolean;
    loesung: boolean;
    /** `extra` is the exam-independent extra sheet (issue #228). */
    jobs: Partial<Record<"exam" | "qr" | "copies" | "extra", string>>;
  }
</script>

<script lang="ts">
  import { onDestroy, tick, untrack } from "svelte";
  import { faArrowsRotate, faBookOpen, faCircleCheck, faCircleInfo, faCopy, faFileLines, faKey, faNoteSticky, faPrint, faScissors, faTag, faTriangleExclamation, faUser, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";
  import { downloadBlob } from "#lib/components/stats/chartExport";
  import InfoTip from "#lib/components/help/InfoTip.svelte";
  import SectionHeading from "#lib/components/help/SectionHeading.svelte";
  import { t, translate } from "#lib/i18n";
  import { compileExtraSheet } from "#lib/exam/examPreview";
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
  import { printFileKey, spotChoices, stickersPerCopy, type PrintSettings } from "#lib/exam/printLayout";
  import type { ExamLayoutPatch } from "#lib/exam/saveExamLayout";
  import type { ExamPreviewStatus } from "#lib/components/exam/ExamPreviewPanel.svelte";
  import StickerSheetForm from "#lib/components/sharing/StickerSheetForm.svelte";
  import { Alert, Badge, Button, Card, Checkbox, Icon, OptionTile, actionIcons } from "#lib/components/ui";

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
    /** Out: what the preview shows, only the planned jobs (sheets while current, sticker or copies PDFs while made for the current content). */
    shown?: PrintPreviews;
    class?: string;
  }

  let { examId, examTitle, exerciseCount, entries, entriesError, preview, hasMc, copiesUnavailable, loadExamPdf, downloadPdf, compile, print, onPrintChange, shown = $bindable(), class: className = "" }: Props = $props();

  let cs = $derived($examChecksState && $examChecksState.examId === examId ? $examChecksState : null);
  let stamps = $derived(cs?.stamps ? printStamps(cs.stamps.content, cs.stamps.students, print) : null);
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
  let stickers = $derived(stickersPerCopy(print, pageCount));
  // Examance arranges the booklet: the task sheet is printed as imposed A3 sheets, so that is what the preview and the download show.
  let imposed = $derived(booklet === "impose");
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
  const spotIcon = { cover: faFileLines, sheet: faCopy, a3: faBookOpen, leaf: faScissors } as const;
  const levelIcon = { ok: faCircleCheck, warn: faTriangleExclamation, info: faCircleInfo };
  const levelClass = { ok: "text-success-fg", warn: "text-warning-fg", info: "text-muted" };

  /** The key a made file must carry to be current (layout, arranging, sticker count; the imposed sheet also the compiled sheet it came from). */
  function fileKey(job: "exam" | "qr" | "copies"): string {
    const key = printFileKey(job, booklet, stickers);
    return job === "exam" ? `${key}:${preview?.version ?? 0}` : key;
  }

  /** Whether the job's PDF exists for the current content and print settings: the compiled preview for the sheets (the imposed A3 sheets for an Examance booklet), a made PDF for the QR jobs. */
  function made(job: PrintJobId): boolean {
    if (job === "solution") return solutionCurrent;
    if (job === "exam") return pdfCurrent && (!imposed || jobPdf.exam?.key === fileKey("exam"));
    // A file made in this visit must also match the print settings; one made before (only its stamp is stored) counts by the stamp.
    const file = jobPdf[job];
    return !!stamps && printMadeValid(cs?.checks, job, stamps) && (!file || file.key === fileKey(job));
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
  let jobPdf = $state.raw<Partial<Record<PrintJobId, { url: string; bytes: Uint8Array; fileName: string; key: string; download?: SavedFile }>>>({});
  let creators = $state<Partial<Record<PrintJobId, () => Promise<void>>>>({});

  let preparing = $state(false);

  // The extra sheet (issue #228): no exam content and no "printed" tick, it is printed in stock; current while made for the chosen paper.
  let extraSheet = $state.raw<{ url: string; bytes: Uint8Array; key: string } | null>(null);
  let extraKey = $derived(printFileKey("extra", null, 0, print.paperStyle));
  let extraMade = $derived(extraSheet?.key === extraKey);

  async function makeExtraSheet() {
    const key = extraKey;
    const { pdfBytes } = await compileExtraSheet(print.paperStyle);
    if (extraSheet) URL.revokeObjectURL(extraSheet.url);
    extraSheet = { url: URL.createObjectURL(new Blob([pdfBytes as BlobPart], { type: "application/pdf" })), bytes: pdfBytes, key };
  }

  function downloadExtraSheet() {
    if (extraSheet) downloadBlob(new Blob([extraSheet.bytes as BlobPart], { type: "application/pdf" }), `${slug(translate("exam.print.extra.fileName"))}_${print.paperStyle}.pdf`);
  }

  /** The one action of the Print step: compiles what the plan prints (the solution only when it is printed; unchanged sources come from the compile cache), then makes the sticker or copies PDF unless the current one is still valid. */
  async function prepare() {
    if (preparing) return;
    preparing = true;
    error = "";
    try {
      if (compile && (!pdfCurrent || (plan.solution && !solutionCurrent))) {
        await compile({ solution: plan.solution });
        // Lets the new preview status (current sheet, its version) reach this component before the files are made from it.
        await tick();
      }
      // The sticker count follows the sheet's pages; it must reach the sticker form before that makes its PDF.
      if (print.mode === "stickers" && print.stickerSpots !== "cover") {
        await countPages();
        await tick();
      }
      for (const job of jobs) {
        if (job === "exam" && imposed && !made("exam")) await imposeSheet(); // NOSONAR: one PDF at a time
        if ((job === "qr" || job === "copies") && !(made(job) && jobPdf[job])) await creators[job]?.(); // NOSONAR: one PDF at a time
      }
      if (!extraMade) await makeExtraSheet();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      preparing = false;
    }
  }

  function keep(job: "exam" | "qr" | "copies", pdf: Uint8Array, fileName: string, download?: SavedFile) {
    const old = jobPdf[job];
    if (old) URL.revokeObjectURL(old.url);
    const url = URL.createObjectURL(new Blob([pdf as BlobPart], { type: "application/pdf" }));
    jobPdf = { ...jobPdf, [job]: { url, bytes: pdf, fileName, key: fileKey(job), download } };
  }

  function gotPdf(job: "qr" | "copies", pdf: Uint8Array, fileName: string, download?: SavedFile) {
    keep(job, pdf, fileName, download);
    recordMade(job);
  }

  /** One A3 booklet of the current task sheet, printed as often as needed (a booklet needs a multiple of 4 pages; filler pages or blanks pad it). */
  async function imposeSheet() {
    const pdf = await loadExamPdf();
    const lib = await import("pdf-lib");
    const pages = (await lib.PDFDocument.load(pdf)).getPageCount();
    keep("exam", await imposeBooklet(pdf, pages), `${slug(examTitle || "exam")}_booklet.pdf`);
  }

  async function countPages() {
    try {
      const pdf = await loadExamPdf();
      pageCount = (await (await import("pdf-lib")).PDFDocument.load(pdf)).getPageCount();
    } catch {
      pageCount = 0;
    }
  }

  function downloadJob(job: PrintJobId) {
    const made = jobPdf[job];
    if (!made) return;
    const file = made.download ?? { bytes: made.bytes, fileName: made.fileName, type: "application/pdf" };
    downloadBlob(new Blob([file.bytes as BlobPart], { type: file.type }), file.fileName);
  }

  /** The plain task sheet or solution; for a booklet Examance arranges, the imposed A3 sheets the preview shows. */
  async function downloadSheet(job: "exam" | "solution") {
    if (job === "exam" && imposed) return downloadJob("exam");
    return downloadPdf(job === "exam" ? "angabe" : "loesung");
  }

  onDestroy(() => {
    for (const made of Object.values(jobPdf)) if (made) URL.revokeObjectURL(made.url);
    if (extraSheet) URL.revokeObjectURL(extraSheet.url);
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
  const setTick = (job: PrintJobId, on: boolean) => cs && stamps && save(withPrintCheck(cs.checks, job, on ? stamps[job] : null));
  const recordMade = (job: PrintJobId) => {
    if (cs && stamps && !printMadeValid(cs.checks, job, stamps)) void save(withPrintMade(cs.checks, job, stamps[job]));
  };

  // Every newly shown task sheet is counted once (the sticker count follows it); an outdated sheet is not.
  let countedFor = -1;
  $effect.pre(() => {
    const want = print.mode === "stickers" && print.stickerSpots !== "cover" && pdfCurrent;
    const at = preview?.version ?? 0;
    untrack(() => {
      if (!want || countedFor === at) return;
      countedFor = at;
      void countPages();
    });
  });
  // The preview shows only what the plan prints, and only while it fits the current content.
  $effect.pre(() => {
    const next: PrintPreviews = {
      angabe: jobs.includes("exam") && !imposed,
      loesung: jobs.includes("solution"),
      jobs: {
        ...Object.fromEntries(
          (["exam", "qr", "copies"] as const).flatMap((job) => {
            const url = jobPdf[job]?.url;
            return url && jobs.includes(job) && made(job) ? [[job, url]] : [];
          }),
        ),
        ...(extraMade && extraSheet ? { extra: extraSheet.url } : {}),
      },
    };
    untrack(() => (shown = next));
  });
</script>

<div class="flex min-w-0 flex-col gap-4 {className}">
  <Card>
    <div class="mb-3 flex items-center gap-2">
      <h2 class="m-0 text-base font-semibold text-content">{$t("exam.print.planTitle")}</h2>
      <InfoTip text={$t("exam.print.planIntro")} />
    </div>
    <!-- Two columns where the card is wide: the choices that shape the files on the left, the rest and the readiness on the right. -->
    <div class="@container">
      <div class="grid grid-cols-1 gap-x-6 gap-y-4 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <fieldset class="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" disabled={busy || saving || !cs}>
          <legend class="sr-only">{$t("exam.print.planTitle")}</legend>
          <!-- Mode, layout and spots shape the sheet, so they live on the exam (issue #220); the booklet arranging and the solution are print-plan choices. -->
          <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby="print-mode-label">
            <SectionHeading id="print-mode-label" label={$t("exam.print.modeLegend")} info={$t("exam.print.modeInfo")} />
            <div class="@container">
              <div class="grid grid-cols-1 gap-2 @xs:grid-cols-2">
                <OptionTile compact name="print-mode" value="stickers" checked={print.mode === "stickers"} icon={faTag} title={$t("exam.print.modeStickers")} text={$t("exam.print.modeStickersText")} onchange={() => change({ printMode: "stickers" })} />
                <OptionTile compact name="print-mode" value="copies" checked={print.mode === "copies"} disabled={!!copiesUnavailable} icon={faUser} title={$t("exam.print.modeCopies")} text={copiesUnavailable ?? $t("exam.print.modeCopiesText")} onchange={() => change({ printMode: "copies" })} />
              </div>
            </div>
          </div>

          <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby="print-layout-label">
            <SectionHeading id="print-layout-label" label={$t("exam.print.layoutLegend")} info={$t("exam.print.layoutInfo")} />
            <div class="@container">
              <div class="grid grid-cols-1 gap-2 @xs:grid-cols-2">
                <OptionTile compact name="print-layout" value="duplex" checked={print.layout === "duplex"} icon={faCopy} title={$t("exam.print.duplex")} text={$t("exam.print.duplexText")} onchange={() => change({ printLayout: "duplex" })} />
                <OptionTile compact name="print-layout" value="booklet" checked={print.layout === "booklet"} icon={faBookOpen} title={$t("exam.print.booklet.label")} text={$t("exam.print.booklet.text")} onchange={() => change({ printLayout: "booklet" })} />
              </div>
            </div>
          </div>

          {#if booklet}
            <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby="print-booklet-label">
              <SectionHeading id="print-booklet-label" label={$t("exam.print.booklet.legend")} info={$t("exam.print.booklet.info")} />
              <div class="@container">
                <div class="grid grid-cols-1 gap-2 @xs:grid-cols-2">
                  <OptionTile compact name="print-booklet" value="impose" checked={booklet === "impose"} icon={faWandMagicSparkles} title={$t("exam.print.booklet.impose")} text={$t("exam.print.booklet.imposeText")} onchange={() => setPlan({ booklet: "impose" })} />
                  <OptionTile compact name="print-booklet" value="printer" checked={booklet === "printer"} icon={faPrint} title={$t("exam.print.booklet.printer")} text={$t("exam.print.booklet.printerText")} onchange={() => setPlan({ booklet: "printer" })} />
                </div>
              </div>
            </div>
          {/if}
        </fieldset>

        <div class="flex min-w-0 flex-col gap-3">
          {#if print.mode === "stickers"}
            <fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0" disabled={busy || saving || !cs} aria-labelledby="print-spots-label">
              <SectionHeading id="print-spots-label" label={$t("exam.print.spots.legend")} info={$t("exam.print.spots.info")} />
              <div class="@container">
                <div class="grid grid-cols-1 gap-2 {spotChoices(print.layout).length > 2 ? '@xs:grid-cols-3' : '@xs:grid-cols-2'}">
                  {#each spotChoices(print.layout) as spot (spot)}
                    <OptionTile compact name="print-spots" value={spot} checked={print.stickerSpots === spot} icon={spotIcon[spot]} title={$t(`exam.print.spots.${spot}`)} text={$t(`exam.print.spots.${spot}Text`)} onchange={() => change({ stickerSpots: spot })} />
                  {/each}
                </div>
              </div>
            </fieldset>
          {/if}

          <OptionTile type="checkbox" compact checked={plan.solution} disabled={busy || saving || !cs} icon={faKey} title={$t("exam.print.withSolution")} text={$t("exam.print.withSolutionText")} onToggle={(on) => setPlan({ solution: on })} />
          <p class="m-0 flex items-start gap-2 rounded-md bg-surface-sunken p-2 text-sm text-content">
            <Icon icon={faPrint} class="mt-0.5 shrink-0 text-muted" />{$t(`exam.print.howTo.${howTo}`)}
          </p>
          <Button class="self-start" icon={faArrowsRotate} loading={preparing || !!preview?.busy} disabled={preparing || saving || !!preview?.busy || !compile} onClick={prepare}>{$t("exam.print.prepare")}</Button>

          <section class="mt-1 flex min-w-0 flex-col gap-2" aria-labelledby="print-ready-title">
            <h3 id="print-ready-title" class="m-0 text-xs font-semibold tracking-wide text-muted uppercase">{$t("exam.print.ready.title")}</h3>
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
      </div>
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
              stickersPerStudent={stickers}
              bind:create={creators[job]}
              onPdf={(pdf, _kind, fileName, download) => gotPdf(job === "copies" ? "copies" : "qr", pdf, fileName, download)}
            />
          {/if}
        {/if}

        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3">
          <Checkbox checked={valid} disabled={busy || !stamps || !canTick} onChange={(on) => setTick(job, on)} label={$t("exam.print.job.printed")} />
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
    <li class="flex min-w-0 flex-col gap-2 rounded-xl border border-line bg-surface-raised p-4">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0 flex-1">
          <h3 class="m-0 flex items-center gap-1.5 text-base font-semibold"><Icon icon={faNoteSticky} class="text-muted" />{$t("exam.print.extra.title")}</h3>
          <p class="m-0 mt-0.5 text-sm text-muted">{$t("exam.print.extra.hint", { paper: $t(`exam.layout.paper.${print.paperStyle}`) })}</p>
        </div>
        <Button size="sm" variant="outlined" severity="secondary" iconOnly icon={actionIcons.download} disabled={!extraMade} ariaLabel={$t("exam.print.job.download")} title={$t("exam.print.job.download")} onClick={downloadExtraSheet} />
      </div>
      {#if !extraMade}<span class="text-xs text-muted">{$t("exam.print.extra.needsPdf")}</span>{/if}
    </li>
  </ol>
</div>
