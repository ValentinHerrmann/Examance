<script lang="ts">
  import { untrack } from "svelte";
  import { get } from "svelte/store";
  import { api } from "#lib/api/client";
  import { saveExamEncrypted } from "#lib/db/dbEncryption";
  import type { ExamRecord, ExerciseRecord } from "#lib/db/schema";
  import { t, locale, translate } from "#lib/i18n";
  import { setExamLogo, type ExamLogoChange } from "#lib/latex/logo";
  import { entriesError, type LatexPackageEntry } from "#lib/latex/packages";
  import { isAuthenticated, sessionStore } from "#lib/stores/session";
  import { docsHref } from "#lib/help/docsLink";
  import LatexEditor from "#lib/components/LatexEditor.svelte";
  import ExamLogoField from "#lib/components/logo/ExamLogoField.svelte";
  import ExamPackagesField from "#lib/components/latex-packages/ExamPackagesField.svelte";
  import { printSettingsOf, type PrintSettings } from "#lib/exam/printLayout";
  import { Alert, Button, Checkbox, CrossLink, Field, Radio } from "#lib/components/ui";

  /** The exam's print layout (issue #212): info text, name line, cut-corner hint, MC correction legend, multi-sheet printing (issue #220), logo and LaTeX packages. Edited inline on the Exam page next to its preview; metadata lives in the details dialog. */
  interface Props {
    exam: ExamRecord;
    /** The exam's exercises, for the package result. */
    exercises: ExerciseRecord[];
    /** The saved exam: the page takes it over and marks the preview as outdated. */
    onSaved: (exam: ExamRecord) => void;
    /** Unsaved edits, for the page's leave guard. */
    dirty?: boolean;
  }

  let { exam, exercises, onSaved, dirty = $bindable(false) }: Props = $props();

  let infoText = $state("");
  let nameLine = $state(false);
  let mcCorrectionHint = $state(false);
  let print: PrintSettings = $state({ pageCodes: false, layout: "duplex", padding: "blank", sheetStickers: false });
  let logoChange: ExamLogoChange | null = $state.raw(null);
  let latexPackages: LatexPackageEntry[] | null = $state.raw(null);
  let initial = $state({ infoText: "", nameLine: false, mcCorrectionHint: false, print: "", latexPackages: "null" });
  let busy = $state(false);
  let error = $state("");
  let saved = $state(false);
  // Bumped on reset so the logo field drops a staged choice.
  let resetSeq = $state(0);

  function reset() {
    infoText = exam.infoText || "";
    nameLine = exam.nameLine === true;
    mcCorrectionHint = exam.mcCorrectionHint === true;
    print = printSettingsOf(exam);
    latexPackages = exam.latexPackages ?? null;
    logoChange = null;
    initial = { infoText, nameLine, mcCorrectionHint, print: JSON.stringify(print), latexPackages: JSON.stringify(latexPackages) };
    error = "";
    resetSeq++;
  }

  let isDirty = $derived(
    infoText !== initial.infoText ||
      nameLine !== initial.nameLine ||
      mcCorrectionHint !== initial.mcCorrectionHint ||
      JSON.stringify(print) !== initial.print ||
      logoChange !== null ||
      JSON.stringify(latexPackages) !== initial.latexPackages,
  );

  async function save() {
    if (latexPackages && entriesError(latexPackages)) {
      error = translate("latexPackages.exam.invalid");
      return;
    }
    // An empty override prints the same as none; the server stores both as "follows the account".
    const packages = latexPackages?.length ? latexPackages : null;
    busy = true;
    error = "";
    saved = false;
    try {
      if (get(isAuthenticated)) {
        await api.patch(`/exams/${exam.id}`, {
          info_text: infoText,
          name_line: nameLine,
          mc_correction_hint: mcCorrectionHint,
          page_codes: print.pageCodes,
          print_layout: print.layout,
          padding_pages: print.padding,
          sheet_stickers: print.sheetStickers,
          latex_packages: packages,
        });
      }
      const printFields = { pageCodes: print.pageCodes, printLayout: print.layout, paddingPages: print.padding, sheetStickers: print.sheetStickers };
      const updated: ExamRecord = { ...exam, infoText, nameLine, mcCorrectionHint, ...printFields, latexPackages: packages };
      await saveExamEncrypted(updated, get(sessionStore).sessionKey);
      if (logoChange) {
        try {
          await setExamLogo(updated.id, logoChange.mode, logoChange.bytes);
        } catch (err: any) {
          error = translate("logo.exam.saveFailed", { message: err.message });
        }
      }
      onSaved(updated);
      saved = !error;
    } catch (err: any) {
      error = translate("exam.page.metadata.saveFailed", { message: err.message });
    } finally {
      busy = false;
    }
  }

  let loadedFor = "";
  $effect.pre(() => {
    const id = exam.id;
    if (loadedFor !== id) {
      loadedFor = id;
      untrack(reset);
    }
  });

  $effect.pre(() => {
    const d = isDirty;
    untrack(() => {
      dirty = d;
      if (d) saved = false;
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

  <!-- Multi-sheet printing (issue #220): page codes, duplex or booklet, filler pages, sticker box per sheet. -->
  <fieldset class="m-0 flex flex-col gap-3 rounded-md border border-border p-3">
    <legend class="px-1 text-sm font-semibold">{$t("exam.layout.print.title")}</legend>
    <Field hint={$t("exam.layout.print.pageCodesHint")}>
      <Checkbox id="layoutPageCodes" bind:checked={print.pageCodes} label={$t("exam.layout.print.pageCodes")} />
    </Field>
    {#if print.pageCodes}
      <Field label={$t("exam.layout.print.layout")} info={$t("exam.layout.print.layoutInfo")}>
        <div class="flex flex-wrap gap-x-4 gap-y-1">
          <Radio group={print.layout} value="duplex" name="print-layout" onchange={() => (print.layout = "duplex")} label={$t("exam.layout.print.duplex")} />
          <Radio group={print.layout} value="booklet" name="print-layout" onchange={() => (print.layout = "booklet")} label={$t("exam.layout.print.booklet")} />
        </div>
      </Field>
      <Field label={$t("exam.layout.print.padding")} info={$t("exam.layout.print.paddingInfo")}>
        <div class="flex flex-wrap gap-x-4 gap-y-1">
          <Radio group={print.padding} value="workspace" name="print-padding" onchange={() => (print.padding = "workspace")} label={$t("exam.layout.print.paddingWorkspace")} />
          <Radio group={print.padding} value="blank" name="print-padding" onchange={() => (print.padding = "blank")} label={$t("exam.layout.print.paddingBlank")} />
        </div>
      </Field>
      <Field hint={$t(print.layout === "booklet" ? "exam.layout.print.sheetStickersBooklet" : "exam.layout.print.sheetStickersHint")}>
        <Checkbox id="layoutSheetStickers" bind:checked={print.sheetStickers} disabled={print.layout === "booklet"} label={$t("exam.layout.print.sheetStickers")} />
      </Field>
    {/if}
    <CrossLink href={docsHref("exams#multi-sheet", $locale)} class="self-start text-sm">{$t("exam.layout.print.guide")}</CrossLink>
  </fieldset>

  {#key resetSeq}
    <ExamLogoField examId={exam.id} bind:change={logoChange} />
  {/key}
  <ExamPackagesField bind:packages={latexPackages} exerciseSources={exercises.map((ex) => ({ label: ex.name || "", latex: ex.latexBody || "" }))} />

  {#if error}<Alert severity="danger">{error}</Alert>{/if}
  {#if saved}<Alert severity="success">{$t("exam.layout.saved")}</Alert>{/if}

  <div class="flex flex-wrap justify-end gap-2">
    <Button variant="outlined" severity="secondary" onClick={reset} disabled={!isDirty || busy}>{$t("exam.layout.discard")}</Button>
    <Button onClick={save} loading={busy} disabled={!isDirty || busy}>{$t("common.save")}</Button>
  </div>
</div>
