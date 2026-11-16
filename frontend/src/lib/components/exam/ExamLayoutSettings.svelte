<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { createAutosave, IDLE_SAVE, type AutosaveStatus } from "#lib/utils/autosave";
  import type { ExamRecord } from "#lib/db/schema";
  import { t, locale, translate } from "#lib/i18n";
  import { setExamLogo, type ExamLogoChange } from "#lib/latex/logo";
  import { docsHref } from "#lib/help/docsLink";
  import { clampExtraPages, MAX_EXTRA_PAGES, printSettingsOf, spotChoices, type PaperStyle, type PrintLayout, type PrintMode, type StickerSpots } from "#lib/exam/printLayout";
  import { saveExamLayout, type ExamLayoutPatch } from "#lib/exam/saveExamLayout";
  import { LAYOUT_PRESETS, matchPreset, type LayoutPresetId, type PresetFields } from "#lib/exam/layoutPresets";
  import { sheetSketchOf, type SketchPageRole, type SketchPart } from "#lib/exam/sheetSketch";
  import LatexEditor from "#lib/components/LatexEditor.svelte";
  import ExamLogoField from "#lib/components/logo/ExamLogoField.svelte";
  import InfoTip from "#lib/components/help/InfoTip.svelte";
  import ExtraNotesField from "#lib/components/exam/ExtraNotesField.svelte";
  import SheetSketch from "#lib/components/exam/sketch/SheetSketch.svelte";
  import OptionPictogram from "#lib/components/exam/sketch/OptionPictogram.svelte";
  import { extraNotesKey, type ExtraNotes } from "#lib/db/schema";
  import SectionHeading from "#lib/components/help/SectionHeading.svelte";
  import { faBookOpen, faCopy, faFile, faFileLines, faGripLines, faPenToSquare, faQrcode, faScissors, faSignature, faTableCells, faTag, faUser, faUserSecret, faBook, faPenNib, type IconDefinition } from "@fortawesome/free-solid-svg-icons";
  import { Card, CrossLink, Field, OptionTile, SaveStatus, TextInput } from "#lib/components/ui";

  /** The Layout step (issue #272): every choice that changes how the exam looks, from presets to the writing paper, beside a live content-free sketch. Every change saves itself; the Print step only prints. */
  interface Props {
    exam: ExamRecord;
    /** Why personalised copies cannot be made (no Examance grading, withheld code), or null. */
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

  function load() {
    infoText = exam.infoText || "";
    nameLine = exam.nameLine === true;
    mcCorrectionHint = exam.mcCorrectionHint === true;
    const print = printSettingsOf(exam);
    pageCodes = print.pageCodes;
    digitalGrading = print.digitalGrading;
    resultsQrBox = exam.resultsQrBox === true;
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
      printLayout: print.layout,
      printMode: rec?.printMode === "copies" ? "copies" : "stickers",
      stickerSpots: print.stickerSpots,
      paperStyle: print.paperStyle,
      extraPages: print.extraPages,
      extraNotes: extraNotesKey(rec?.extraNotes),
    };
  }

  /** The current edits as record fields, for the sketch, the preset match and the pictograms. */
  let current = $derived({ infoText, nameLine, mcCorrectionHint, pageCodes, digitalGrading, resultsQrBox, printLayout, printMode, stickerSpots, paperStyle, extraPages });

  /** The fields that differ from the last save. */
  function changes(): ExamLayoutPatch {
    const patch: ExamLayoutPatch = {};
    for (const key of ["infoText", "nameLine", "mcCorrectionHint", "pageCodes", "digitalGrading", "resultsQrBox", "printLayout", "printMode", "stickerSpots", "paperStyle", "extraPages"] as const) {
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
    ({ digitalGrading, resultsQrBox, nameLine, pageCodes, mcCorrectionHint, printLayout, printMode, stickerSpots } = fields);
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
  let model = $derived(sheetSketchOf(current, hasLogo));
  /** The sketch of the current edits with *patch* applied, for a tile's pictogram. */
  const modelWith = (patch: Partial<ExamLayoutPatch>) => sheetSketchOf({ ...current, ...patch }, hasLogo);
  const lit = (part: SketchPart) => (on: boolean) => (highlight = on ? part : highlight === part ? null : highlight);
  const presetIcon: Record<LayoutPresetId, IconDefinition> = { fullDigital: faQrcode, digitalBooklet: faBook, anonymousPaper: faUserSecret, namedPaper: faPenNib };
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

{#snippet picto(patch: Partial<ExamLayoutPatch>, page: SketchPageRole | "sticker", part: SketchPart)}
  <OptionPictogram model={modelWith(patch)} {page} {part} />
{/snippet}

{#snippet choice(group: string, value: string, checked: boolean, icon: IconDefinition, title: string, text: string, part: SketchPart, patch: Partial<ExamLayoutPatch>, page: SketchPageRole | "sticker", onPick: () => void, disabled = false)}
  <OptionTile compact name={group} {value} {checked} {disabled} {icon} {title} {text} onchange={onPick} onHighlight={lit(part)}>
    {#snippet illustration()}{@render picto(patch, page, part)}{/snippet}
  </OptionTile>
{/snippet}

<!-- Options on the left, the sketch beside them from xl (on top on phones, so a choice shows at once). -->
<div class="grid min-w-0 grid-cols-1 items-start gap-x-6 gap-y-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
  <Card class="min-w-0 xl:sticky xl:top-4 xl:order-2">
    <SheetSketch {model} {highlight} />
  </Card>

  <Card class="min-w-0" title={$t("exam.sidebar.layout")}>
    {#snippet actions()}
      <SaveStatus {status} />
    {/snippet}
    <div class="@container flex flex-col gap-5">
      <section class="flex flex-col gap-2" aria-labelledby="layout-presets">
        <SectionHeading id="layout-presets" tag="h3" label={$t("exam.layout.presets.heading")} info={$t("exam.layout.presets.info")} />
        <div class="grid grid-cols-1 gap-2 @xl:grid-cols-2" role="radiogroup" aria-labelledby="layout-presets">
          {#each LAYOUT_PRESETS as p (p.id)}
            <OptionTile compact name="layout-preset" value={p.id} checked={preset === p.id} icon={presetIcon[p.id]} title={$t(`exam.layout.presets.${p.id}`)} text={$t(`exam.layout.presets.${p.id}Text`)} onchange={() => applyPreset(p.fields)}>
              {#snippet illustration()}{@render picto(p.fields, "cover", "qr")}{/snippet}
            </OptionTile>
          {/each}
        </div>
        {#if preset === "custom"}<p class="m-0 text-xs text-muted">{$t("exam.layout.presets.custom")}</p>{/if}
      </section>

      <!-- Teachers who grade on paper elsewhere print no scan aids (issue #228). -->
      <section class="flex flex-col gap-2" aria-labelledby="layout-grading">
        <SectionHeading id="layout-grading" tag="h3" label={$t("exam.layout.grading.heading")} info={$t("exam.layout.grading.info")} />
        <OptionTile type="checkbox" compact checked={digitalGrading} icon={faQrcode} title={$t("exam.layout.grading.digital")} text={$t("exam.layout.grading.digitalText")} onToggle={(on) => (digitalGrading = on)} onHighlight={lit("scanAids")}>
          {#snippet illustration()}{@render picto({ digitalGrading: true }, "exercises", "scanAids")}{/snippet}
        </OptionTile>
      </section>

      <div class="grid grid-cols-1 items-start gap-x-6 gap-y-5 @3xl:grid-cols-2">
        <section class="flex min-w-0 flex-col gap-3" aria-labelledby="layout-cover">
          <SectionHeading id="layout-cover" tag="h3" label={$t("exam.layout.sections.cover")} info={$t("exam.layout.sections.coverInfo")} />
          <Field label={$t("exam.metadataEditor.infoText")}>
            <LatexEditor bind:value={infoText} rows={4} />
          </Field>
          <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby="layout-name">
            <SectionHeading id="layout-name" label={$t("exam.layout.choices.nameLegend")} info={$t("exam.metadataEditor.nameLineHint")} />
            {#if digitalGrading}
              <div class="grid grid-cols-1 gap-2 @xs:grid-cols-2">
                {@render choice("layout-name", "qr", !nameLine, faQrcode, $t("exam.layout.choices.nameQr"), $t("exam.layout.choices.nameQrText"), "qr", { nameLine: false }, "cover", () => (nameLine = false))}
                {@render choice("layout-name", "line", nameLine, faSignature, $t("exam.layout.choices.nameLine"), $t("exam.layout.choices.nameLineText"), "name", { nameLine: true }, "cover", () => (nameLine = true))}
              </div>
            {:else}
              <div class="grid grid-cols-1 gap-2">
                {@render choice("layout-name", "line", paperName === "line", faSignature, $t("exam.layout.choices.paperLine"), $t("exam.layout.choices.paperLineText"), "name", { nameLine: true, resultsQrBox: false }, "cover", () => setPaperName("line"))}
                {@render choice("layout-name", "qr", paperName === "qr", faUserSecret, $t("exam.layout.choices.paperQr"), $t("exam.layout.choices.paperQrText"), "qr", { nameLine: false, resultsQrBox: true }, "cover", () => setPaperName("qr"))}
                {@render choice("layout-name", "both", paperName === "both", faQrcode, $t("exam.layout.choices.paperBoth"), $t("exam.layout.choices.paperBothText"), "name", { nameLine: true, resultsQrBox: true }, "cover", () => setPaperName("both"))}
              </div>
            {/if}
          </div>
          {#key resetSeq}
            <ExamLogoField examId={exam.id} bind:change={logoChange} bind:hasLogo />
          {/key}
        </section>

        <!-- Every exam keeps the cut-off corner (issue #211); page codes shape every sheet (issue #220). -->
        <section class="flex min-w-0 flex-col gap-3" aria-labelledby="layout-sheet">
          <SectionHeading id="layout-sheet" tag="h3" label={$t("exam.layout.sections.sheet")} info={$t("exam.layout.sections.sheetInfo")} />
          {#if digitalGrading}
            <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby="layout-codes">
              <SectionHeading id="layout-codes" label={$t("exam.layout.choices.codesLegend")} info={$t("exam.layout.print.pageCodesInfo")} />
              <div class="grid grid-cols-1 gap-2 @xs:grid-cols-2">
                {@render choice("layout-codes", "off", !pageCodes, faFileLines, $t("exam.layout.choices.codesCover"), $t("exam.layout.choices.codesCoverText"), "pageCodes", { pageCodes: false }, "exercises", () => (pageCodes = false))}
                {@render choice("layout-codes", "on", pageCodes, faQrcode, $t("exam.layout.choices.codesAll"), $t("exam.layout.choices.codesAllText"), "pageCodes", { pageCodes: true }, "exercises", () => (pageCodes = true))}
              </div>
            </div>
          {/if}
          <OptionTile type="checkbox" compact checked={mcCorrectionHint} icon={faPenToSquare} title={$t("exam.layout.choices.mcHint")} text={$t("exam.layout.choices.mcHintText")} onToggle={(on) => (mcCorrectionHint = on)} onHighlight={lit("mcHint")}>
            {#snippet titleExtra()}<InfoTip text={$t("exam.metadataEditor.mcCorrectionHintHint")} />{/snippet}
            {#snippet illustration()}{@render picto({ mcCorrectionHint: true }, "exercises", "mcHint")}{/snippet}
          </OptionTile>
          <div class="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <CrossLink href={docsHref("exams#cut-corner", $locale)}>{$t("exam.metadataEditor.cutCornerLayout")}</CrossLink>
            <CrossLink href={docsHref("exams#multi-sheet", $locale)}>{$t("exam.layout.print.guide")}</CrossLink>
          </div>
        </section>

        <!-- How the sheets are made: it changes filler pages, the fold zone and the sticker fields, so it lives here, not on the Print step (issue #272). -->
        <section class="flex min-w-0 flex-col gap-3" aria-labelledby="layout-printing">
          <SectionHeading id="layout-printing" tag="h3" label={$t("exam.layout.sections.printing")} info={$t("exam.layout.sections.printingInfo")} />
          {#if digitalGrading}
            <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby="layout-mode">
              <SectionHeading id="layout-mode" label={$t("exam.print.modeLegend")} info={$t("exam.print.modeInfo")} />
              <div class="grid grid-cols-1 gap-2 @xs:grid-cols-2">
                {@render choice("layout-mode", "stickers", printMode === "stickers", faTag, $t("exam.print.modeStickers"), $t("exam.print.modeStickersText"), "qr", { printMode: "stickers" }, "cover", () => (printMode = "stickers"))}
                {@render choice("layout-mode", "copies", printMode === "copies", faUser, $t("exam.print.modeCopies"), copiesUnavailable ?? $t("exam.print.modeCopiesText"), "qr", { printMode: "copies" }, "cover", () => (printMode = "copies"), !!copiesUnavailable && printMode !== "copies")}
              </div>
            </div>
          {/if}
          <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby="layout-layout">
            <SectionHeading id="layout-layout" label={$t("exam.print.layoutLegend")} info={$t("exam.print.layoutInfo")} />
            <div class="grid grid-cols-1 gap-2 @xs:grid-cols-2">
              {@render choice("layout-layout", "duplex", printLayout === "duplex", faCopy, $t("exam.print.duplex"), $t("exam.print.duplexText"), "fold", { printLayout: "duplex" }, "exercises", () => setLayout("duplex"))}
              {@render choice("layout-layout", "booklet", printLayout === "booklet", faBookOpen, $t("exam.print.booklet.label"), $t("exam.print.booklet.text"), "fold", { printLayout: "booklet" }, "exercises", () => setLayout("booklet"))}
            </div>
          </div>
          {#if digitalGrading && printMode === "stickers"}
            <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby="layout-spots">
              <SectionHeading id="layout-spots" label={$t("exam.print.spots.legend")} info={$t("exam.print.spots.info")} />
              <div class="grid grid-cols-1 gap-2">
                {#each spotChoices(printLayout) as spot (spot)}
                  {@render choice("layout-spots", spot, stickerSpots === spot, spotIcon[spot], $t(`exam.print.spots.${spot}`), $t(`exam.print.spots.${spot}Text`), "stickers", { stickerSpots: spot }, "sticker", () => (stickerSpots = spot))}
                {/each}
              </div>
            </div>
          {/if}
        </section>

        <!-- Extra paper (issue #228): one paper for every writing space and one heading for the exam's own; filling up to whole sheets follows the print form. -->
        <section class="flex min-w-0 flex-col gap-3" aria-labelledby="layout-writing">
          <SectionHeading id="layout-writing" tag="h3" label={$t("exam.layout.paper.heading")} info={$t("exam.layout.paper.styleInfo")} />
          <div class="grid grid-cols-1 gap-2" role="radiogroup" aria-label={$t("exam.layout.paper.style")}>
            {@render choice("paper-style", "squared", paperStyle === "squared", faTableCells, $t("exam.layout.paper.squared"), $t("exam.layout.paper.squaredText"), "paper", { paperStyle: "squared" }, "writing", () => (paperStyle = "squared"))}
            {@render choice("paper-style", "lined", paperStyle === "lined", faGripLines, $t("exam.layout.paper.lined"), $t("exam.layout.paper.linedText"), "paper", { paperStyle: "lined" }, "writing", () => (paperStyle = "lined"))}
            {@render choice("paper-style", "empty", paperStyle === "empty", faFile, $t("exam.layout.paper.empty"), $t("exam.layout.paper.emptyText"), "paper", { paperStyle: "empty" }, "writing", () => (paperStyle = "empty"))}
          </div>
          <ExtraNotesField value={extraNotes} onChange={(next) => (extraNotes = next)} idPrefix="layoutExtraNotes" />
          <Field label={$t("exam.layout.paper.extraPages")} forId="layoutExtraPages" info={$t("exam.layout.paper.extraPagesInfo", { max: MAX_EXTRA_PAGES })}>
            <TextInput id="layoutExtraPages" type="number" min="0" max={String(MAX_EXTRA_PAGES)} step="1" class="w-24" bind:value={extraPagesText} />
          </Field>
          <CrossLink href={docsHref("exams#extra-paper", $locale)} class="self-start text-sm">{$t("exam.layout.paper.guide")}</CrossLink>
        </section>
      </div>
    </div>
  </Card>
</div>
