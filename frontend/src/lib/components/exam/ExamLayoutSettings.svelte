<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { createAutosave, IDLE_SAVE, type AutosaveStatus } from "#lib/utils/autosave";
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
  import { extraNotesKey, type ExtraNotes } from "#lib/db/schema";
  import SectionHeading from "#lib/components/help/SectionHeading.svelte";
  import { faFile, faFileLines, faGripLines, faPenToSquare, faQrcode, faSignature, faSquare, faTableCells, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import { CrossLink, Field, OptionTile, TextInput } from "#lib/components/ui";

  /** The exam's page layout (issues #212, #220, #228): info text, name line, cut-corner hint, MC correction legend, page codes, filler pages, extra paper, logo and LaTeX packages. Every change saves itself (no buttons); how the exam is printed lives on the Print step. */
  interface Props {
    exam: ExamRecord;
    /** The exam's exercises, for the package result. */
    exercises: ExerciseRecord[];
    /** The saved exam: the page takes it over and marks the preview as outdated. */
    onSaved: (exam: ExamRecord) => void;
    /** A change is waiting for or in its save, for the page's leave guard. */
    dirty?: boolean;
    /** Out: the autosave status, for the card header's `SaveStatus`. */
    status?: AutosaveStatus;
  }

  let { exam, exercises, onSaved, dirty = $bindable(false), status = $bindable(IDLE_SAVE) }: Props = $props();

  let infoText = $state("");
  let nameLine = $state(false);
  let mcCorrectionHint = $state(false);
  let pageCodes = $state(false);
  let digitalGrading = $state(true);
  let resultsQrBox = $state(false);
  let paperStyle = $state<PaperStyle>("empty");
  /** The number field's text; saved clamped to 0..MAX_EXTRA_PAGES. */
  let extraPagesText = $state("0");
  /** The writing space's heading, note and rest-of-page area (issues #156, #228); null until first edited. */
  let extraNotes: ExtraNotes | null = $state.raw(null);
  let extraPages = $derived(clampExtraPages(extraPagesText));
  let logoChange: ExamLogoChange | null = $state.raw(null);
  let latexPackages: LatexPackageEntry[] | null = $state.raw(null);
  let saved = $state(savedOf(null));
  // Bumped on load so the logo field drops a staged choice.
  let resetSeq = $state(0);

  function load() {
    infoText = exam.infoText || "";
    nameLine = exam.nameLine === true;
    mcCorrectionHint = exam.mcCorrectionHint === true;
    const print = printSettingsOf(exam);
    pageCodes = print.pageCodes;
    digitalGrading = print.digitalGrading;
    resultsQrBox = print.resultsQrBox;
    paperStyle = print.paperStyle;
    extraPagesText = String(print.extraPages);
    extraNotes = exam.extraNotes ?? null;
    latexPackages = exam.latexPackages ?? null;
    logoChange = null;
    saved = savedOf(exam);
    resetSeq++;
  }

  /** An empty override prints the same as none; the server stores both as "follows the account". */
  function packagesOf(list: LatexPackageEntry[] | null | undefined) {
    return list?.length ? list : null;
  }

  /** What a saved record holds, in the stored form, to compare edits against. */
  function savedOf(rec: ExamRecord | null) {
    const print = printSettingsOf(rec ?? {});
    return {
      infoText: rec?.infoText || "",
      nameLine: rec?.nameLine === true,
      mcCorrectionHint: rec?.mcCorrectionHint === true,
      pageCodes: print.pageCodes,
      digitalGrading: print.digitalGrading,
      resultsQrBox: print.resultsQrBox,
      paperStyle: print.paperStyle,
      extraPages: print.extraPages,
      extraNotes: extraNotesKey(rec?.extraNotes),
      latexPackages: JSON.stringify(packagesOf(rec?.latexPackages)),
    };
  }

  /** The fields that differ from the last save. */
  function changes(): ExamLayoutPatch {
    const patch: ExamLayoutPatch = {};
    if (infoText !== saved.infoText) patch.infoText = infoText;
    if (nameLine !== saved.nameLine) patch.nameLine = nameLine;
    if (mcCorrectionHint !== saved.mcCorrectionHint) patch.mcCorrectionHint = mcCorrectionHint;
    if (pageCodes !== saved.pageCodes) patch.pageCodes = pageCodes;
    if (digitalGrading !== saved.digitalGrading) patch.digitalGrading = digitalGrading;
    if (resultsQrBox !== saved.resultsQrBox) patch.resultsQrBox = resultsQrBox;
    if (paperStyle !== saved.paperStyle) patch.paperStyle = paperStyle;
    if (extraPages !== saved.extraPages) patch.extraPages = extraPages;
    if (extraNotesKey(extraNotes) !== saved.extraNotes) patch.extraNotes = extraNotes;
    if (JSON.stringify(packagesOf(latexPackages)) !== saved.latexPackages) patch.latexPackages = packagesOf(latexPackages);
    return patch;
  }

  // Every edit changes the key, so an edit made during a save schedules the next one (the hang of issue #228).
  let editKey = $derived(JSON.stringify([infoText, nameLine, mcCorrectionHint, pageCodes, digitalGrading, resultsQrBox, paperStyle, extraPages, extraNotesKey(extraNotes), packagesOf(latexPackages)]));
  let pending = $derived(Object.keys(changes()).length > 0 || logoChange !== null);

  async function save() {
    if (latexPackages && entriesError(latexPackages)) throw new Error(translate("latexPackages.exam.invalid"));
    const patch = changes();
    const logo = logoChange;
    if (!Object.keys(patch).length && !logo) return;
    const updated = Object.keys(patch).length ? await saveExamLayout(exam, patch) : exam;
    saved = savedOf(updated);
    let logoError = "";
    if (logo) {
      try {
        await setExamLogo(updated.id, logo.mode, logo.bytes);
        if (logoChange === logo) logoChange = null;
      } catch (err: any) {
        logoError = translate("logo.exam.saveFailed", { message: err.message });
      }
    }
    onSaved(updated);
    if (logoError) throw new Error(logoError);
  }

  const autosave = createAutosave({ run: save });

  // Leaving the tab still saves what was typed.
  onDestroy(() => autosave.dispose());

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
    void editKey;
    const p = pending;
    const logo = logoChange;
    untrack(() => {
      if (!p) return;
      if (logo) void autosave.flush();
      else autosave.schedule();
    });
  });

  $effect.pre(() => {
    const s = $autosave;
    const p = pending;
    untrack(() => {
      dirty = p || autosave.busy;
      status = s;
    });
  });
</script>

{#snippet pair(id: string, legend: string, info: string, on: boolean, set: (on: boolean) => void, off: { title: string; text: string; icon: IconDefinition }, yes: { title: string; text: string; icon: IconDefinition }, disabled = false)}
  <!-- An on/off setting whose two cases need a word each (issue #228): two tiles, the "off" case first. -->
  <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby={id}>
    <SectionHeading {id} label={legend} {info} />
    <div class="@container">
      <div class="grid grid-cols-1 gap-2 @xs:grid-cols-2">
        <OptionTile compact name={id} value="off" checked={!on} {disabled} icon={off.icon} title={off.title} text={off.text} onchange={() => set(false)} />
        <OptionTile compact name={id} value="on" checked={on} {disabled} icon={yes.icon} title={yes.title} text={yes.text} onchange={() => set(true)} />
      </div>
    </div>
  </div>
{/snippet}

<!-- Sections like the Print step's plan card (issue #228): a small heading with its explanation behind ⓘ, choices as tiles, two columns where the card is wide. -->
<div class="@container flex flex-col gap-5">
  <!-- Teachers who grade on paper elsewhere print no scan aids (issue #228); everything else stays where it is. -->
  <section class="flex flex-col gap-2" aria-labelledby="layout-grading">
    <SectionHeading id="layout-grading" tag="h3" label={$t("exam.layout.grading.heading")} info={$t("exam.layout.grading.info")} />
    <div class="grid grid-cols-1 gap-2 @3xl:grid-cols-2">
      <OptionTile type="checkbox" compact checked={digitalGrading} icon={faQrcode} title={$t("exam.layout.grading.digital")} text={$t("exam.layout.grading.digitalText")} onToggle={(on) => (digitalGrading = on)} />
      {#if !digitalGrading}
        <OptionTile type="checkbox" compact checked={resultsQrBox} icon={faSquare} title={$t("exam.layout.grading.resultsQr")} text={$t("exam.layout.grading.resultsQrText")} onToggle={(on) => (resultsQrBox = on)} />
      {/if}
    </div>
  </section>
  <div class="grid grid-cols-1 gap-x-6 gap-y-5 @3xl:grid-cols-2">
    <div class="flex min-w-0 flex-col gap-5">
      <section class="flex flex-col gap-3" aria-labelledby="layout-cover">
        <SectionHeading id="layout-cover" tag="h3" label={$t("exam.layout.sections.cover")} info={$t("exam.layout.sections.coverInfo")} />
        <Field label={$t("exam.metadataEditor.infoText")}>
          <LatexEditor bind:value={infoText} rows={4} />
        </Field>
        {@render pair("layout-name", $t("exam.layout.choices.nameLegend"), $t("exam.metadataEditor.nameLineHint"), nameLine || !digitalGrading, (on) => (nameLine = on), { title: $t("exam.layout.choices.nameQr"), text: $t("exam.layout.choices.nameQrText"), icon: faQrcode }, { title: $t("exam.layout.choices.nameLine"), text: $t("exam.layout.choices.nameLineText"), icon: faSignature }, !digitalGrading)}
        {#key resetSeq}
          <ExamLogoField examId={exam.id} bind:change={logoChange} />
        {/key}
      </section>

      <!-- Every exam keeps the cut-off corner (issue #211); page codes shape every sheet (issue #220); how it is printed is set on the Print step. -->
      <section class="flex flex-col gap-3" aria-labelledby="layout-sheet">
        <SectionHeading id="layout-sheet" tag="h3" label={$t("exam.layout.sections.sheet")} info={$t("exam.layout.sections.sheetInfo")} />
        {@render pair("layout-codes", $t("exam.layout.choices.codesLegend"), $t("exam.layout.print.pageCodesInfo"), pageCodes, (on) => (pageCodes = on), { title: $t("exam.layout.choices.codesCover"), text: $t("exam.layout.choices.codesCoverText"), icon: faFileLines }, { title: $t("exam.layout.choices.codesAll"), text: $t("exam.layout.choices.codesAllText"), icon: faQrcode }, !digitalGrading)}
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

</div>
