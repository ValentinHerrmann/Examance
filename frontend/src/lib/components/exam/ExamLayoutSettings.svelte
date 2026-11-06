<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import type { ExamRecord, ExerciseRecord } from "#lib/db/schema";
  import { t, locale, translate } from "#lib/i18n";
  import { setExamLogo, type ExamLogoChange } from "#lib/latex/logo";
  import { entriesError, type LatexPackageEntry } from "#lib/latex/packages";
  import { docsHref } from "#lib/help/docsLink";
  import { clampExtraPages, MAX_EXTRA_PAGES, printSettingsOf, type PaddingPages, type PaperStyle } from "#lib/exam/printLayout";
  import { saveExamLayout, type ExamLayoutPatch } from "#lib/exam/saveExamLayout";
  import LatexEditor from "#lib/components/LatexEditor.svelte";
  import ExamLogoField from "#lib/components/logo/ExamLogoField.svelte";
  import ExamPackagesField from "#lib/components/latex-packages/ExamPackagesField.svelte";
  import InfoTip from "#lib/components/help/InfoTip.svelte";
  import { Alert, Checkbox, CrossLink, Field, Radio, TextInput } from "#lib/components/ui";

  /** The exam's page layout (issues #212, #220, #228): info text, name line, cut-corner hint, MC correction legend, page codes, filler pages, extra paper, logo and LaTeX packages. Every change saves itself (no buttons); how the exam is printed lives on the Print step. */
  interface Props {
    exam: ExamRecord;
    /** The exam's exercises, for the package result. */
    exercises: ExerciseRecord[];
    /** The saved exam: the page takes it over and marks the preview as outdated. */
    onSaved: (exam: ExamRecord) => void;
    /** A change is waiting for or in its save, for the page's leave guard. */
    dirty?: boolean;
    /** Out: "", saving, saved or the error, for the card header. */
    status?: string;
  }

  let { exam, exercises, onSaved, dirty = $bindable(false), status = $bindable("") }: Props = $props();

  /** Autosave waits this long after the last edit (typing in the info text). */
  const SAVE_DELAY_MS = 800;

  let infoText = $state("");
  let nameLine = $state(false);
  let mcCorrectionHint = $state(false);
  let pageCodes = $state(false);
  let padding = $state<PaddingPages>("none");
  let paperStyle = $state<PaperStyle>("empty");
  /** The number field's text; saved clamped to 0..MAX_EXTRA_PAGES. */
  let extraPagesText = $state("0");
  let extraSheets = $state(false);
  let extraPages = $derived(clampExtraPages(extraPagesText));
  let logoChange: ExamLogoChange | null = $state.raw(null);
  let latexPackages: LatexPackageEntry[] | null = $state.raw(null);
  let saved = $state({ infoText: "", nameLine: false, mcCorrectionHint: false, pageCodes: false, padding: "none", paperStyle: "empty", extraPages: 0, extraSheets: false, latexPackages: "null" });
  let error = $state("");
  let timer: ReturnType<typeof setTimeout> | null = null;
  let saving = $state(false);
  let savedOnce = $state(false);
  // Bumped on load so the logo field drops a staged choice.
  let resetSeq = $state(0);

  function load() {
    infoText = exam.infoText || "";
    nameLine = exam.nameLine === true;
    mcCorrectionHint = exam.mcCorrectionHint === true;
    const print = printSettingsOf(exam);
    pageCodes = print.pageCodes;
    padding = print.padding;
    paperStyle = print.paperStyle;
    extraPagesText = String(print.extraPages);
    extraSheets = print.extraSheets;
    latexPackages = exam.latexPackages ?? null;
    logoChange = null;
    saved = savedOf(exam);
    error = "";
    resetSeq++;
  }

  /** What a saved record holds, to compare edits against. */
  function savedOf(rec: ExamRecord) {
    const print = printSettingsOf(rec);
    return {
      infoText: rec.infoText || "",
      nameLine: rec.nameLine === true,
      mcCorrectionHint: rec.mcCorrectionHint === true,
      pageCodes: print.pageCodes,
      padding: print.padding,
      paperStyle: print.paperStyle,
      extraPages: print.extraPages,
      extraSheets: print.extraSheets,
      latexPackages: JSON.stringify(rec.latexPackages ?? null),
    };
  }

  /** The fields that differ from the last save. */
  function changes(): ExamLayoutPatch {
    const patch: ExamLayoutPatch = {};
    if (infoText !== saved.infoText) patch.infoText = infoText;
    if (nameLine !== saved.nameLine) patch.nameLine = nameLine;
    if (mcCorrectionHint !== saved.mcCorrectionHint) patch.mcCorrectionHint = mcCorrectionHint;
    if (pageCodes !== saved.pageCodes) patch.pageCodes = pageCodes;
    if (padding !== saved.padding) patch.paddingPages = padding;
    if (paperStyle !== saved.paperStyle) patch.paperStyle = paperStyle;
    if (extraPages !== saved.extraPages) patch.extraPages = extraPages;
    if (extraSheets !== saved.extraSheets) patch.extraSheets = extraSheets;
    // An empty override prints the same as none; the server stores both as "follows the account".
    if (JSON.stringify(latexPackages) !== saved.latexPackages) patch.latexPackages = latexPackages?.length ? latexPackages : null;
    return patch;
  }

  let pending = $derived(
    infoText !== saved.infoText ||
      nameLine !== saved.nameLine ||
      mcCorrectionHint !== saved.mcCorrectionHint ||
      pageCodes !== saved.pageCodes ||
      padding !== saved.padding ||
      paperStyle !== saved.paperStyle ||
      extraPages !== saved.extraPages ||
      extraSheets !== saved.extraSheets ||
      logoChange !== null ||
      JSON.stringify(latexPackages) !== saved.latexPackages,
  );

  async function save() {
    timer = null;
    if (saving) return void schedule();
    if (latexPackages && entriesError(latexPackages)) {
      error = translate("latexPackages.exam.invalid");
      return;
    }
    const patch = changes();
    const logo = logoChange;
    saving = true;
    error = "";
    try {
      const updated = Object.keys(patch).length ? await saveExamLayout(exam, patch) : exam;
      saved = savedOf(updated);
      if (logo) {
        try {
          await setExamLogo(updated.id, logo.mode, logo.bytes);
          if (logoChange === logo) logoChange = null;
        } catch (err: any) {
          error = translate("logo.exam.saveFailed", { message: err.message });
        }
      }
      savedOnce = true;
      onSaved(updated);
    } catch (err: any) {
      error = translate("exam.page.metadata.saveFailed", { message: err.message });
    } finally {
      saving = false;
    }
  }

  function schedule() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void save(), SAVE_DELAY_MS);
  }

  onDestroy(() => {
    // Leaving the tab still saves what was typed.
    if (timer) {
      clearTimeout(timer);
      void save();
    }
  });

  let loadedFor = "";
  $effect.pre(() => {
    const id = exam.id;
    if (loadedFor !== id) {
      loadedFor = id;
      untrack(load);
    }
  });

  // Every edit schedules a save; a logo choice saves at once.
  $effect.pre(() => {
    const p = pending;
    const logo = logoChange;
    untrack(() => {
      if (!p) return;
      if (logo) {
        if (timer) clearTimeout(timer);
        void save();
      } else schedule();
    });
  });

  $effect.pre(() => {
    const d = pending || saving;
    const text = error ? "" : saving || pending ? $t("exam.layout.saving") : savedOnce ? $t("exam.layout.saved") : "";
    untrack(() => {
      dirty = d;
      status = text;
    });
  });
</script>

<div class="flex flex-col gap-4">
  <Field label={$t("exam.metadataEditor.infoText")}>
    <LatexEditor bind:value={infoText} rows={4} />
  </Field>

  <Field hint={$t("exam.metadataEditor.nameLineHint")}>
    <Checkbox id="layoutNameLine" bind:checked={nameLine} label={$t("exam.metadataEditor.nameLine")} />
  </Field>

  <!-- Every exam keeps the cut-off corner (issue #211); the guide's sketch shows the usable space. -->
  <div class="flex flex-col gap-1.5">
    <p class="m-0 text-sm text-muted">{$t("exam.metadataEditor.pageLayoutHint")}</p>
    <CrossLink href={docsHref("exams#cut-corner", $locale)} class="self-start text-sm">{$t("exam.metadataEditor.cutCornerLayout")}</CrossLink>
  </div>

  <Field hint={$t("exam.metadataEditor.mcCorrectionHintHint")}>
    <Checkbox id="layoutMcCorrectionHint" bind:checked={mcCorrectionHint} label={$t("exam.metadataEditor.mcCorrectionHint")} />
  </Field>

  <!-- Multi-sheet layout (issue #220): page codes and filler pages shape every printed sheet; how it is printed (double-sided or booklet, stickers) is set on the Print step. -->
  <h3 class="m-0 mt-2 text-xs font-semibold tracking-wide text-muted uppercase">{$t("exam.layout.print.heading")}</h3>
  <Field hint={$t("exam.layout.print.pageCodesHint")}>
    <span class="flex items-center gap-1.5">
      <Checkbox id="layoutPageCodes" bind:checked={pageCodes} label={$t("exam.layout.print.pageCodes")} />
      <InfoTip text={$t("exam.layout.print.pageCodesInfo")} />
    </span>
  </Field>
  <Field label={$t("exam.layout.print.padding")} info={$t("exam.layout.print.paddingInfo")}>
    <div class="flex flex-wrap gap-x-4 gap-y-1">
      <Radio group={padding} value="workspace" name="print-padding" onchange={() => (padding = "workspace")} label={$t("exam.layout.print.paddingWorkspace")} />
      <Radio group={padding} value="blank" name="print-padding" onchange={() => (padding = "blank")} label={$t("exam.layout.print.paddingBlank")} />
      <Radio group={padding} value="none" name="print-padding" onchange={() => (padding = "none")} label={$t("exam.layout.print.paddingNone")} />
    </div>
  </Field>
  <CrossLink href={docsHref("exams#multi-sheet", $locale)} class="self-start text-sm">{$t("exam.layout.print.guide")}</CrossLink>

  <!-- Extra paper (issue #228): one pattern for every writing page (extra pages, workspace filler pages, the extra-sheet stack). -->
  <h3 class="m-0 mt-2 text-xs font-semibold tracking-wide text-muted uppercase">{$t("exam.layout.paper.heading")}</h3>
  <Field label={$t("exam.layout.paper.style")} info={$t("exam.layout.paper.styleInfo")}>
    <div class="flex flex-wrap gap-x-4 gap-y-1">
      <Radio group={paperStyle} value="squared" name="paper-style" onchange={() => (paperStyle = "squared")} label={$t("exam.layout.paper.squared")} />
      <Radio group={paperStyle} value="lined" name="paper-style" onchange={() => (paperStyle = "lined")} label={$t("exam.layout.paper.lined")} />
      <Radio group={paperStyle} value="empty" name="paper-style" onchange={() => (paperStyle = "empty")} label={$t("exam.layout.paper.empty")} />
    </div>
  </Field>
  <Field label={$t("exam.layout.paper.extraPages")} forId="layoutExtraPages" info={$t("exam.layout.paper.extraPagesInfo", { max: MAX_EXTRA_PAGES })}>
    <TextInput id="layoutExtraPages" type="number" min="0" max={String(MAX_EXTRA_PAGES)} step="1" class="w-24" bind:value={extraPagesText} />
  </Field>
  <Field hint={$t("exam.layout.paper.extraSheetsHint")}>
    <Checkbox id="layoutExtraSheets" bind:checked={extraSheets} label={$t("exam.layout.paper.extraSheets")} />
  </Field>
  <CrossLink href={docsHref("exams#extra-paper", $locale)} class="self-start text-sm">{$t("exam.layout.paper.guide")}</CrossLink>

  {#key resetSeq}
    <ExamLogoField examId={exam.id} bind:change={logoChange} />
  {/key}
  <ExamPackagesField bind:packages={latexPackages} exerciseSources={exercises.map((ex) => ({ label: ex.name || "", latex: ex.latexBody || "" }))} />

  {#if error}<Alert severity="danger">{error}</Alert>{/if}
</div>
