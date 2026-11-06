<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import type { ExamRecord, ExerciseRecord } from "#lib/db/schema";
  import { t, locale, translate } from "#lib/i18n";
  import { setExamLogo, type ExamLogoChange } from "#lib/latex/logo";
  import { entriesError, type LatexPackageEntry } from "#lib/latex/packages";
  import { docsHref } from "#lib/help/docsLink";
  import { clampExtraPages, MAX_EXTRA_PAGES, printSettingsOf, type PaperStyle } from "#lib/exam/printLayout";
  import { saveExamLayout, type ExamLayoutPatch } from "#lib/exam/saveExamLayout";
  import LatexEditor from "#lib/components/LatexEditor.svelte";
  import ExamLogoField from "#lib/components/logo/ExamLogoField.svelte";
  import ExamPackagesField from "#lib/components/latex-packages/ExamPackagesField.svelte";
  import InfoTip from "#lib/components/help/InfoTip.svelte";
  import ExtraNotesField from "#lib/components/exam/ExtraNotesField.svelte";
  import type { ExtraNotes } from "#lib/db/schema";
  import SectionHeading from "#lib/components/help/SectionHeading.svelte";
  import { faFile, faFileLines, faGripLines, faPenToSquare, faQrcode, faSignature, faTableCells, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import { Alert, CrossLink, Field, OptionTile, TextInput } from "#lib/components/ui";

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
  let paperStyle = $state<PaperStyle>("empty");
  /** The number field's text; saved clamped to 0..MAX_EXTRA_PAGES. */
  let extraPagesText = $state("0");
  /** The writing space's heading, note and rest-of-page area (issues #156, #228); null until first edited. */
  let extraNotes: ExtraNotes | null = $state.raw(null);
  let extraPages = $derived(clampExtraPages(extraPagesText));
  let logoChange: ExamLogoChange | null = $state.raw(null);
  let latexPackages: LatexPackageEntry[] | null = $state.raw(null);
  let saved = $state({ infoText: "", nameLine: false, mcCorrectionHint: false, pageCodes: false, paperStyle: "empty", extraPages: 0, extraNotes: "null", latexPackages: "null" });
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
    paperStyle = print.paperStyle;
    extraPagesText = String(print.extraPages);
    extraNotes = exam.extraNotes ?? null;
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
      paperStyle: print.paperStyle,
      extraPages: print.extraPages,
      extraNotes: JSON.stringify(rec.extraNotes ?? null),
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
    if (paperStyle !== saved.paperStyle) patch.paperStyle = paperStyle;
    if (extraPages !== saved.extraPages) patch.extraPages = extraPages;
    if (JSON.stringify(extraNotes) !== saved.extraNotes) patch.extraNotes = extraNotes;
    // An empty override prints the same as none; the server stores both as "follows the account".
    if (JSON.stringify(latexPackages) !== saved.latexPackages) patch.latexPackages = latexPackages?.length ? latexPackages : null;
    return patch;
  }

  let pending = $derived(
    infoText !== saved.infoText ||
      nameLine !== saved.nameLine ||
      mcCorrectionHint !== saved.mcCorrectionHint ||
      pageCodes !== saved.pageCodes ||
      paperStyle !== saved.paperStyle ||
      extraPages !== saved.extraPages ||
      JSON.stringify(extraNotes) !== saved.extraNotes ||
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

{#snippet pair(id: string, legend: string, info: string, on: boolean, set: (on: boolean) => void, off: { title: string; text: string; icon: IconDefinition }, yes: { title: string; text: string; icon: IconDefinition })}
  <!-- An on/off setting whose two cases need a word each (issue #228): two tiles, the "off" case first. -->
  <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby={id}>
    <SectionHeading {id} label={legend} {info} />
    <div class="@container">
      <div class="grid grid-cols-1 gap-2 @xs:grid-cols-2">
        <OptionTile compact name={id} value="off" checked={!on} icon={off.icon} title={off.title} text={off.text} onchange={() => set(false)} />
        <OptionTile compact name={id} value="on" checked={on} icon={yes.icon} title={yes.title} text={yes.text} onchange={() => set(true)} />
      </div>
    </div>
  </div>
{/snippet}

<!-- Sections like the Print step's plan card (issue #228): a small heading with its explanation behind ⓘ, choices as tiles, two columns where the card is wide. -->
<div class="@container">
  <div class="grid grid-cols-1 gap-x-6 gap-y-5 @3xl:grid-cols-2">
    <div class="flex min-w-0 flex-col gap-5">
      <section class="flex flex-col gap-3" aria-labelledby="layout-cover">
        <SectionHeading id="layout-cover" tag="h3" label={$t("exam.layout.sections.cover")} info={$t("exam.layout.sections.coverInfo")} />
        <Field label={$t("exam.metadataEditor.infoText")}>
          <LatexEditor bind:value={infoText} rows={4} />
        </Field>
        {@render pair("layout-name", $t("exam.layout.choices.nameLegend"), $t("exam.metadataEditor.nameLineHint"), nameLine, (on) => (nameLine = on), { title: $t("exam.layout.choices.nameQr"), text: $t("exam.layout.choices.nameQrText"), icon: faQrcode }, { title: $t("exam.layout.choices.nameLine"), text: $t("exam.layout.choices.nameLineText"), icon: faSignature })}
        {#key resetSeq}
          <ExamLogoField examId={exam.id} bind:change={logoChange} />
        {/key}
      </section>

      <!-- Every exam keeps the cut-off corner (issue #211); page codes shape every sheet (issue #220); how it is printed is set on the Print step. -->
      <section class="flex flex-col gap-3" aria-labelledby="layout-sheet">
        <SectionHeading id="layout-sheet" tag="h3" label={$t("exam.layout.sections.sheet")} info={$t("exam.layout.sections.sheetInfo")} />
        {@render pair("layout-codes", $t("exam.layout.choices.codesLegend"), $t("exam.layout.print.pageCodesInfo"), pageCodes, (on) => (pageCodes = on), { title: $t("exam.layout.choices.codesCover"), text: $t("exam.layout.choices.codesCoverText"), icon: faFileLines }, { title: $t("exam.layout.choices.codesAll"), text: $t("exam.layout.choices.codesAllText"), icon: faQrcode })}
        <OptionTile type="checkbox" compact checked={mcCorrectionHint} icon={faPenToSquare} title={$t("exam.layout.choices.mcHint")} text={$t("exam.layout.choices.mcHintText")} onToggle={(on) => (mcCorrectionHint = on)}>
          {#snippet titleExtra()}<InfoTip text={$t("exam.metadataEditor.mcCorrectionHintHint")} />{/snippet}
        </OptionTile>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <CrossLink href={docsHref("exams#cut-corner", $locale)}>{$t("exam.metadataEditor.cutCornerLayout")}</CrossLink>
          <CrossLink href={docsHref("exams#multi-sheet", $locale)}>{$t("exam.layout.print.guide")}</CrossLink>
        </div>
      </section>
    </div>

    <!-- Extra paper (issue #228): one paper for every writing space and one heading for the exam's own; filling up to whole sheets follows the Print step. -->
    <section class="flex min-w-0 flex-col gap-3" aria-labelledby="layout-writing">
      <SectionHeading id="layout-writing" tag="h3" label={$t("exam.layout.paper.heading")} info={$t("exam.layout.paper.styleInfo")} />
      <div class="@container" role="radiogroup" aria-label={$t("exam.layout.paper.style")}>
        <div class="grid grid-cols-1 gap-2 @xs:grid-cols-3">
          <OptionTile compact name="paper-style" value="squared" checked={paperStyle === "squared"} icon={faTableCells} title={$t("exam.layout.paper.squared")} text={$t("exam.layout.paper.squaredText")} onchange={() => (paperStyle = "squared")} />
          <OptionTile compact name="paper-style" value="lined" checked={paperStyle === "lined"} icon={faGripLines} title={$t("exam.layout.paper.lined")} text={$t("exam.layout.paper.linedText")} onchange={() => (paperStyle = "lined")} />
          <OptionTile compact name="paper-style" value="empty" checked={paperStyle === "empty"} icon={faFile} title={$t("exam.layout.paper.empty")} text={$t("exam.layout.paper.emptyText")} onchange={() => (paperStyle = "empty")} />
        </div>
      </div>
      <ExtraNotesField value={extraNotes} onChange={(next) => (extraNotes = next)} idPrefix="layoutExtraNotes" />
      <Field label={$t("exam.layout.paper.extraPages")} forId="layoutExtraPages" info={$t("exam.layout.paper.extraPagesInfo", { max: MAX_EXTRA_PAGES })}>
        <TextInput id="layoutExtraPages" type="number" min="0" max={String(MAX_EXTRA_PAGES)} step="1" class="w-24" bind:value={extraPagesText} />
      </Field>
      <CrossLink href={docsHref("exams#extra-paper", $locale)} class="self-start text-sm">{$t("exam.layout.paper.guide")}</CrossLink>
    </section>

    <!-- The packages field carries its own legend. -->
    <section class="flex min-w-0 flex-col gap-3 @3xl:col-span-2">
      <ExamPackagesField bind:packages={latexPackages} exerciseSources={exercises.map((ex) => ({ label: ex.name || "", latex: ex.latexBody || "" }))} />
    </section>
  </div>

  {#if error}<Alert severity="danger" class="mt-4">{error}</Alert>{/if}
</div>
