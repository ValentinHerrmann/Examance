<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { createAutosave, IDLE_SAVE, type AutosaveStatus } from "#lib/utils/autosave";
  import type { ExamRecord } from "#lib/db/schema";
  import { t, locale, translate } from "#lib/i18n";
  import { setExamLogo, type ExamLogoChange } from "#lib/latex/logo";
  import { docsHref } from "#lib/help/docsLink";
  import { clampExtraPages, MAX_EXTRA_PAGES, printSettingsOf, spotChoices, type PaperStyle, type PrintLayout, type PrintMode, type StickerSpots } from "#lib/exam/printLayout";
  import { saveExamLayout, type ExamLayoutPatch } from "#lib/exam/saveExamLayout";
  import { allScanAidsOn, LAYOUT_PRESETS, matchPreset, type LayoutPresetId, type PresetFields } from "#lib/exam/layoutPresets";
  import type { SketchPart } from "#lib/exam/sheetSketch";
  import LatexEditor from "#lib/components/LatexEditor.svelte";
  import ExamLogoField from "#lib/components/logo/ExamLogoField.svelte";
  import ExtraNotesField from "#lib/components/exam/ExtraNotesField.svelte";
  import SheetSketch from "#lib/components/exam/sketch/SheetSketch.svelte";
  import LayoutChoiceRow, { type LayoutChoice } from "#lib/components/exam/LayoutChoiceRow.svelte";
  import { extraNotesKey, type ExtraNotes } from "#lib/db/schema";
  import SectionHeading from "#lib/components/help/SectionHeading.svelte";
  import { faBookOpen, faBraille, faCopy, faFile, faFileLines, faGripLines, faPenToSquare, faQrcode, faScissors, faSignature, faTableCells, faTag, faUser, faUserSecret, faBook, faPenNib, faTriangleExclamation, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import { Button, Card, CrossLink, Field, Icon, SaveStatus, TextInput } from "#lib/components/ui";

  /** The Layout step (issue #272): every choice that changes how the exam looks, from presets to the writing paper, beside a live content-free sketch. Every change saves itself; the Print step only prints. */
  interface Props {
    exam: ExamRecord;
    /** Why personalised copies cannot be made (exercise texts withheld), or null. */
    copiesUnavailable: string | null;
    /** The saved exam: the page takes it over. */
    onSaved: (exam: ExamRecord) => void;
    /** A change is waiting for or in its save, for the page's leave guard. */
    dirty?: boolean;
  }

  let { exam, copiesUnavailable, onSaved, dirty = $bindable(false) }: Props = $props();

  let infoText = $state("");
  let nameLine = $state(false);
  let mcCorrectionHint = $state(false);
  let pageCodes = $state(false);
  let digitalGrading = $state(true);
  let resultsQrBox = $state(false);
  let cutCorner = $state(true);
  let foldStrip = $state(true);
  let dottedFields = $state(false);
  let printLayout = $state<PrintLayout>("duplex");
  let printMode = $state<PrintMode>("stickers");
  let stickerSpots = $state<StickerSpots>("cover");
  let paperStyle = $state<PaperStyle>("empty");
  /** The number field's text; saved clamped to 0..MAX_EXTRA_PAGES. */
  let extraPagesText = $state("0");
  /** The writing space's heading, note and rest-of-page area (issues #156, #228); null until first edited. */
  let extraNotes: ExtraNotes | null = $state.raw(null);
  let extraPages = $derived(clampExtraPages(extraPagesText));
  let logoChange: ExamLogoChange | null = $state.raw(null);
  let hasLogo = $state(false);
  let saved = $state(savedOf(null));
  let status = $state<AutosaveStatus>(IDLE_SAVE);
  // Bumped on load so the logo field drops a staged choice.
  let resetSeq = $state(0);
  /** The sketch element of the hovered or focused tile. */
  let highlight = $state<SketchPart | null>(null);
  /** The element whose page the preview shows; `seq` lets the same element be asked for again. */
  let show = $state.raw<{ part: SketchPart | null; seq: number }>({ part: null, seq: 0 });

  function load() {
    infoText = exam.infoText || "";
    nameLine = exam.nameLine === true;
    mcCorrectionHint = exam.mcCorrectionHint === true;
    const print = printSettingsOf(exam);
    pageCodes = print.pageCodes;
    digitalGrading = print.digitalGrading;
    resultsQrBox = exam.resultsQrBox === true;
    cutCorner = print.cutCorner;
    foldStrip = print.foldStrip;
    dottedFields = print.dottedFields;
    printLayout = print.layout;
    printMode = exam.printMode === "copies" ? "copies" : "stickers";
    stickerSpots = print.stickerSpots;
    paperStyle = print.paperStyle;
    extraPagesText = String(print.extraPages);
    extraNotes = exam.extraNotes ?? null;
    logoChange = null;
    saved = savedOf(exam);
    resetSeq++;
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
      resultsQrBox: rec?.resultsQrBox === true,
      cutCorner: print.cutCorner,
      foldStrip: print.foldStrip,
      dottedFields: print.dottedFields,
      printLayout: print.layout,
      printMode: rec?.printMode === "copies" ? "copies" : "stickers",
      stickerSpots: print.stickerSpots,
      paperStyle: print.paperStyle,
      extraPages: print.extraPages,
      extraNotes: extraNotesKey(rec?.extraNotes),
    };
  }

  /** The current edits as record fields, for the sketch, the preset match and the pictograms. */
  let current = $derived({ infoText, nameLine, mcCorrectionHint, pageCodes, digitalGrading, resultsQrBox, cutCorner, foldStrip, dottedFields, printLayout, printMode, stickerSpots, paperStyle, extraPages });

  /** The fields that differ from the last save. */
  function changes(): ExamLayoutPatch {
    const patch: ExamLayoutPatch = {};
    for (const key of ["infoText", "nameLine", "mcCorrectionHint", "pageCodes", "digitalGrading", "resultsQrBox", "cutCorner", "foldStrip", "dottedFields", "printLayout", "printMode", "stickerSpots", "paperStyle", "extraPages"] as const) {
      if (current[key] !== saved[key]) (patch as Record<string, unknown>)[key] = current[key];
    }
    if (extraNotesKey(extraNotes) !== saved.extraNotes) patch.extraNotes = extraNotes;
    return patch;
  }

  // Every edit changes the key, so an edit made during a save schedules the next one (the hang of issue #228).
  let editKey = $derived(JSON.stringify([current, extraNotesKey(extraNotes)]));
  let pending = $derived(Object.keys(changes()).length > 0 || logoChange !== null);

  async function save() {
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

  // Leaving the page still saves what was chosen.
  onDestroy(() => autosave.dispose());

  /** A preset sets its fields at once; everything stays editable afterwards. */
  function applyPreset(fields: PresetFields) {
    ({ digitalGrading, resultsQrBox, cutCorner, foldStrip, nameLine, pageCodes, mcCorrectionHint, printLayout, printMode, stickerSpots } = fields);
  }

  /** A layout change keeps the nearest sticker-spot choice of the new layout. */
  function setLayout(next: PrintLayout) {
    printLayout = next;
    stickerSpots = printSettingsOf({ printLayout: next, stickerSpots }).stickerSpots;
  }

  // Without Examance grading the cover names the student by a line, a QR sticker box or both (issue #272).
  type PaperName = "line" | "qr" | "both";
  let paperName = $derived<PaperName>(!resultsQrBox ? "line" : nameLine ? "both" : "qr");
  function setPaperName(next: PaperName) {
    resultsQrBox = next !== "line";
    nameLine = next !== "qr";
  }

  let preset = $derived(matchPreset(current));
  /** Stresses *part* while hovered or focused; leaving clears it only if no other element took over meanwhile. */
  function light(part: SketchPart, on: boolean) {
    if (on) highlight = part;
    else if (highlight === part) highlight = null;
  }
  /** Moves the preview to *part*'s page: only on focus or a click, never on a hover (the page jumped while the pointer crossed the card). */
  function showPart(part: SketchPart) {
    show = { part, seq: show.seq + 1 };
  }
  function focusPart(part: SketchPart) {
    light(part, true);
    showPart(part);
  }
  /** Handlers for a field: the pointer stresses its element, focus also shows its page. */
  const stress = (part: SketchPart) => ({
    onfocusin: () => focusPart(part),
    onfocusout: () => light(part, false),
    onpointerenter: () => light(part, true),
    onpointerleave: () => light(part, false),
  });
  const presetIcon: Record<LayoutPresetId, IconDefinition> = { fullDigital: faQrcode, digitalCopiesBooklet: faBook, anonymousPaperCopies: faUserSecret, namedPaperBooklet: faPenNib };

  let presetChoices = $derived<LayoutChoice[]>(
    LAYOUT_PRESETS.map((p) => ({ value: p.id, checked: preset === p.id, icon: presetIcon[p.id], title: $t(`exam.layout.presets.${p.id}`), text: $t(`exam.layout.presets.${p.id}Text`), onPick: () => applyPreset(p.fields) })),
  );

  let booklet = $derived(printLayout === "booklet");
  let aidsOn = $derived(allScanAidsOn({ digitalGrading, cutCorner, pageCodes, foldStrip, printLayout }));
  /** Every scan aid on at once, e.g. after a paper preset, to grade in Examance. */
  function turnOnScanAids() {
    digitalGrading = true;
    cutCorner = true;
    pageCodes = true;
    foldStrip = true;
  }
  /** The spots as printed: a paper cover without QR box prints none beyond the cover. */
  let printedSpots = $derived(printSettingsOf(current).stickerSpots);
  let copies = $derived(printMode === "copies");
  let aidChoices = $derived<LayoutChoice[]>([
    { value: "markers", checked: digitalGrading, icon: faQrcode, title: $t("exam.layout.grading.markers"), text: $t("exam.layout.grading.markersText"), part: "markers", onPick: (on) => (digitalGrading = on) },
    { value: "cutCorner", checked: cutCorner || copies, icon: faScissors, title: $t("exam.layout.grading.cutCorner"), text: $t("exam.layout.grading.cutCornerText"), disabledReason: copies ? $t("exam.layout.grading.cutCornerCopies") : null, part: "cutCorner", onPick: (on) => (cutCorner = on) },
    { value: "pageCodes", checked: pageCodes, icon: faTableCells, title: $t("exam.layout.grading.pageCodes"), text: $t(digitalGrading ? "exam.layout.grading.pageCodesText" : "exam.layout.grading.pageCodesUnread"), part: "pageCodes", onPick: (on) => (pageCodes = on) },
    { value: "foldStrip", checked: booklet && foldStrip, icon: faBookOpen, title: $t("exam.layout.grading.foldStrip"), text: $t("exam.layout.grading.foldStripText"), disabledReason: booklet ? null : $t("exam.layout.grading.foldStripDuplex"), part: "fold", onPick: (on) => (foldStrip = on) },
  ]);

  // A personalised copy always carries its printed QR code; name and key sit on the corner that is cut off.
  let nameChoices = $derived<LayoutChoice[]>(
    digitalGrading || copies
      ? [
          { value: "qr", checked: !nameLine, icon: faQrcode, title: $t("exam.layout.choices.nameQr"), text: $t(copies ? "exam.layout.choices.copiesQrText" : "exam.layout.choices.nameQrText"), part: "qr", onPick: () => (nameLine = false) },
          { value: "line", checked: nameLine, icon: faSignature, title: $t("exam.layout.choices.nameLine"), text: $t("exam.layout.choices.nameLineText"), part: "name", onPick: () => (nameLine = true) },
        ]
      : [
          { value: "line", checked: paperName === "line", icon: faSignature, title: $t("exam.layout.choices.paperLine"), text: $t("exam.layout.choices.paperLineText"), part: "name", onPick: () => setPaperName("line") },
          { value: "qr", checked: paperName === "qr", icon: faUserSecret, title: $t("exam.layout.choices.paperQr"), text: $t("exam.layout.choices.paperQrText"), part: "qr", onPick: () => setPaperName("qr") },
          { value: "both", checked: paperName === "both", icon: faQrcode, title: $t("exam.layout.choices.paperBoth"), text: $t("exam.layout.choices.paperBothText"), part: "name", onPick: () => setPaperName("both") },
        ],
  );
  const spotIcon = { cover: faFileLines, sheet: faCopy, a3: faBookOpen, leaf: faScissors } as const;

  let loadedFor = "";
  $effect.pre(() => {
    const id = exam.id;
    if (loadedFor !== id) {
      loadedFor = id;
      untrack(load);
    }
  });

  // Every edit schedules a save; a logo choice or a preset saves at once.
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

<!-- Options on the left, the preview beside them from xl (on top on phones, so a choice shows at once). Sections follow the decisions: how it is graded and printed first, then the pages from the cover on. -->
<div class="grid min-w-0 grid-cols-1 items-start gap-x-6 gap-y-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
  <Card class="min-w-0 xl:sticky xl:top-4 xl:order-2">
    <SheetSketch examId={exam.id} fields={{ ...current, extraNotes }} {hasLogo} {highlight} {show} />
  </Card>

  <Card class="min-w-0" title={$t("exam.sidebar.layout")}>
    {#snippet actions()}
      <SaveStatus {status} />
    {/snippet}
    <div class="@container flex flex-col gap-5">
      <LayoutChoiceRow id="layout-presets" label={$t("exam.layout.presets.heading")} info={$t("exam.layout.presets.info")} columns={2} choices={presetChoices} fallback={$t("exam.layout.presets.custom")} onHighlight={light} onShow={showPart} />

      <!-- Each scan aid on its own (issue #272); the corner markers are what Examance's scanner needs, so they carry the grading switch. -->
      <section class="flex min-w-0 flex-col gap-2 border-t border-line pt-4" aria-labelledby="layout-grading-heading">
        <SectionHeading id="layout-grading-heading" tag="h3" label={$t("exam.layout.grading.heading")} info={$t("exam.layout.grading.info")} />
        <LayoutChoiceRow id="layout-aids" label={$t("exam.layout.grading.aids")} type="checkbox" columns={4} choices={aidChoices} fallback={$t("exam.layout.grading.aidsText")} onHighlight={light} onShow={showPart} />
        <!-- Only the corner markers are technically required (scan registration); the other aids are optional, so only they get a warning. -->
        {#if !digitalGrading || !aidsOn}
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 @2xl:pl-44">
            {#if !digitalGrading}
              <p class="m-0 flex min-w-0 flex-1 items-start gap-1.5 text-xs text-warning-fg"><Icon icon={faTriangleExclamation} class="mt-0.5 shrink-0" />{$t("exam.layout.grading.markersRequired")}</p>
            {/if}
            {#if !aidsOn}
              <Button size="sm" variant="outlined" severity="secondary" icon={faQrcode} onClick={turnOnScanAids}>{$t("exam.layout.grading.allOn")}</Button>
            {/if}
          </div>
        {/if}
      </section>

      <!-- How the copies are made: it changes filler pages, the fold and the sticker fields, so it lives here, not on the Print step (issue #272). -->
      <section class="flex min-w-0 flex-col gap-2 border-t border-line pt-4" aria-labelledby="layout-printing">
        <SectionHeading id="layout-printing" tag="h3" label={$t("exam.layout.sections.printing")} info={$t("exam.layout.sections.printingInfo")} />
        <LayoutChoiceRow
          id="layout-mode"
          label={$t("exam.print.modeLegend")}
          info={$t("exam.print.modeInfo")}
          columns={2}
          onHighlight={light} onShow={showPart}
          choices={[
            { value: "stickers", checked: printMode === "stickers", icon: faTag, title: $t("exam.print.modeStickers"), text: $t("exam.print.modeStickersText"), part: "qr", onPick: () => (printMode = "stickers") },
            { value: "copies", checked: printMode === "copies", icon: faUser, title: $t("exam.print.modeCopies"), text: $t("exam.print.modeCopiesText"), disabledReason: printMode === "copies" ? null : copiesUnavailable, part: "qr", onPick: () => (printMode = "copies") },
          ]}
        />
        <LayoutChoiceRow
          id="layout-layout"
          label={$t("exam.print.layoutLegend")}
          info={$t("exam.print.layoutInfo")}
          columns={2}
          onHighlight={light} onShow={showPart}
          choices={[
            { value: "duplex", checked: printLayout === "duplex", icon: faCopy, title: $t("exam.print.duplex"), text: $t("exam.print.duplexText"), part: "fold", onPick: () => setLayout("duplex") },
            { value: "booklet", checked: printLayout === "booklet", icon: faBookOpen, title: $t("exam.print.booklet.label"), text: $t("exam.print.booklet.text"), part: "fold", onPick: () => setLayout("booklet") },
          ]}
        />
        {#if printMode === "stickers"}
          <LayoutChoiceRow
            id="layout-spots"
            label={$t("exam.print.spots.legend")}
            info={$t("exam.print.spots.info")}
            onHighlight={light} onShow={showPart}
            choices={spotChoices(printLayout).map((spot) => ({ value: spot, checked: printedSpots === spot, icon: spotIcon[spot], title: $t(`exam.print.spots.${spot}`), text: $t(`exam.print.spots.${spot}Text`), disabledReason: spot !== "cover" && !digitalGrading && !resultsQrBox ? $t("exam.print.spots.noQr") : null, part: "stickers" as const, onPick: () => (stickerSpots = spot) }))}
          />
        {/if}
      </section>

      <section class="flex min-w-0 flex-col gap-2 border-t border-line pt-4" aria-labelledby="layout-cover">
        <SectionHeading id="layout-cover" tag="h3" label={$t("exam.layout.sections.cover")} info={$t("exam.layout.sections.coverInfo")} />
        <LayoutChoiceRow id="layout-name" label={$t("exam.layout.choices.nameLegend")} info={$t("exam.metadataEditor.nameLineHint")} choices={nameChoices} columns={nameChoices.length === 3 ? 3 : 2} onHighlight={light} onShow={showPart} />
        <div {...stress("info")} role="presentation">
          <Field label={$t("exam.metadataEditor.infoText")}>
            <LatexEditor bind:value={infoText} rows={4} />
          </Field>
        </div>
        <div {...stress("logo")} role="presentation">
          {#key resetSeq}
            <ExamLogoField examId={exam.id} bind:change={logoChange} bind:hasLogo />
          {/key}
        </div>
      </section>

      <!-- Every exam keeps the cut-off corner unless switched off (issues #211, #272). -->
      <section class="flex min-w-0 flex-col gap-2 border-t border-line pt-4" aria-labelledby="layout-sheet">
        <SectionHeading id="layout-sheet" tag="h3" label={$t("exam.layout.sections.sheet")} info={$t("exam.layout.sections.sheetInfo")} />
        <LayoutChoiceRow
          id="layout-hints"
          label={$t("exam.layout.choices.hintsLegend")}
          info={$t("exam.metadataEditor.mcCorrectionHintHint")}
          type="checkbox"
          columns={2}
          fallback={$t("exam.layout.choices.mcHintText")}
          onHighlight={light} onShow={showPart}
          choices={[{ value: "mcHint", checked: mcCorrectionHint, icon: faPenToSquare, title: $t("exam.layout.choices.mcHint"), text: $t("exam.layout.choices.mcHintText"), part: "mcHint", onPick: (on) => (mcCorrectionHint = on) }]}
        />
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          <CrossLink href={docsHref("exams#cut-corner", $locale)}>{$t("exam.metadataEditor.cutCornerLayout")}</CrossLink>
          <CrossLink href={docsHref("exams#multi-sheet", $locale)}>{$t("exam.layout.print.guide")}</CrossLink>
        </div>
      </section>

      <!-- Extra paper (issue #228): one paper for every writing space and one heading for the exam's own; filling up to whole sheets follows the print form. -->
      <section class="flex min-w-0 flex-col gap-2 border-t border-line pt-4" aria-labelledby="layout-writing">
        <SectionHeading id="layout-writing" tag="h3" label={$t("exam.layout.paper.heading")} />
        <LayoutChoiceRow
          id="layout-paper"
          label={$t("exam.layout.paper.style")}
          info={$t("exam.layout.paper.styleInfo")}
          onHighlight={light} onShow={showPart}
          choices={[
            { value: "squared", checked: paperStyle === "squared", icon: faTableCells, title: $t("exam.layout.paper.squared"), text: $t("exam.layout.paper.squaredText"), part: "paper", onPick: () => (paperStyle = "squared") },
            { value: "dotted", checked: paperStyle === "dotted", icon: faBraille, title: $t("exam.layout.paper.dotted"), text: $t("exam.layout.paper.dottedText"), part: "paper", onPick: () => (paperStyle = "dotted") },
            { value: "lined", checked: paperStyle === "lined", icon: faGripLines, title: $t("exam.layout.paper.lined"), text: $t("exam.layout.paper.linedText"), part: "paper", onPick: () => (paperStyle = "lined") },
            { value: "empty", checked: paperStyle === "empty", icon: faFile, title: $t("exam.layout.paper.empty"), text: $t("exam.layout.paper.emptyText"), part: "paper", onPick: () => (paperStyle = "empty") },
          ]}
        />
        <LayoutChoiceRow
          id="layout-dotted-fields"
          label={$t("exam.layout.paper.dottedFields")}
          type="checkbox"
          columns={2}
          fallback={$t("exam.layout.paper.dottedFieldsText")}
          onHighlight={light} onShow={showPart}
          choices={[{ value: "dottedFields", checked: dottedFields, icon: faBraille, title: $t("exam.layout.paper.dottedFields"), text: $t("exam.layout.paper.dottedFieldsText"), part: "paper", onPick: (on) => (dottedFields = on) }]}
        />
        <div {...stress("notes")} role="presentation">
          <ExtraNotesField value={extraNotes} onChange={(next) => (extraNotes = next)} idPrefix="layoutExtraNotes" />
        </div>
        <Field label={$t("exam.layout.paper.extraPages")} forId="layoutExtraPages" info={$t("exam.layout.paper.extraPagesInfo", { max: MAX_EXTRA_PAGES })}>
          <TextInput id="layoutExtraPages" type="number" min="0" max={String(MAX_EXTRA_PAGES)} step="1" class="w-24" bind:value={extraPagesText} onfocus={() => focusPart("paper")} onblur={() => light("paper", false)} />
        </Field>
        <CrossLink href={docsHref("exams#extra-paper", $locale)} class="self-start text-sm">{$t("exam.layout.paper.guide")}</CrossLink>
      </section>
    </div>
  </Card>
</div>
