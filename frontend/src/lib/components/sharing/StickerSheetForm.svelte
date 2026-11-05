<script lang="ts">
  /** Prints QR name stickers, optionally with personal key slips (issues #83, #207), or the QR codes directly onto personalised exam copies (issue #211). It prints the exam's students as entered on the Students page, or only their key slips (reprint of lost keys). Shown inline on the Print page and inside `StickerSheetDialog` (issue #212). */
  import { onMount, untrack } from "svelte";
  import { get } from "svelte/store";
  import { t } from "#lib/i18n";
  import { Alert, Button, Radio, TextInput, actionIcons } from "#lib/components/ui";
  import { downloadBlob } from "#lib/components/stats/chartExport";
  import { slug, ZipBuilder } from "#lib/export/zip";
  import { renderExamCopies } from "#lib/qr/examCopies";
  import { imposeBooklet, splitCopies } from "#lib/qr/booklet";
  import { renderStickerSheet, STICKER_GRID, type StickerEntry } from "#lib/qr/stickerSheet";
  import { loadStickerEntries, stickerIdIssues } from "#lib/sharing/stickerEntries";
  import { awaitSessionReady, sessionStore } from "#lib/stores/session";
  import { studentsHref } from "#lib/utils/links";
  import InfoTip from "#lib/components/help/InfoTip.svelte";

  interface Props {
    /** Prints the exam's students (entered on the Students page). */
    examId: string;
    examTitle?: string;
    /** Starts with only the key slips (reprint from the Share page). */
    keysOnly?: boolean;
    /** The compiled student sheet; offers printing onto exam copies. */
    loadExamPdf?: () => Promise<Uint8Array>;
    /** Why exam copies cannot be printed (shown next to the greyed-out option), or null. */
    copiesUnavailable?: string | null;
    /** True while a PDF is being made; a dialog keeps itself open meanwhile. */
    busy?: boolean;
    /** Fixes the output (the Print step's job rows): no choice shown, and the student count line is left to the page. */
    output?: "stickers" | "copies";
    /** The students, when the page already read them (else the form reads them). */
    entries?: StickerEntry[];
    /** Booklet exams (issue #220): copies imposed onto A3 by Examance, or one file per student for the printer's booklet function; null prints A4 copies as they are. */
    booklet?: "impose" | "printer" | null;
    /** Stickers each student needs (one per sheet with a sticker box on every sheet); the starting value of the count field. */
    stickersPerStudent?: number;
    /** A PDF was handed to the browser: which kind. */
    onDone?: (kind: "stickers" | "copies" | "keys") => void;
    /** Instead of downloading, hand the made PDF to the page (the Print step previews it and offers the download itself); the form then shows no button of its own and the page calls `create`. `download` replaces the PDF as the file to save (the per-student ZIP). */
    onPdf?: (pdf: Uint8Array, kind: "stickers" | "copies" | "keys", fileName: string, download?: SavedFile) => void;
    /** Out: makes the PDF (with `onPdf`). */
    create?: () => Promise<void>;
  }

  let {
    examId,
    examTitle = "",
    keysOnly: startKeysOnly = false,
    loadExamPdf,
    copiesUnavailable = null,
    busy = $bindable(false),
    output: fixedOutput,
    entries,
    booklet = null,
    stickersPerStudent = 1,
    onDone,
    onPdf,
    create = $bindable(),
  }: Props = $props();

  interface SavedFile {
    bytes: Uint8Array;
    fileName: string;
    type: string;
  }

  // The starting choice only; the form owns it from then on.
  const initialKeysOnly = untrack(() => startKeysOnly);
  let examEntries = $state.raw<StickerEntry[]>([]);
  let loadError = $state("");
  let loading = $state(true);
  let copies = $state(String(untrack(() => stickersPerStudent)));
  let skip = $state("0");
  // One choice instead of two checkboxes that exclude each other (issue #212).
  type What = "stickers" | "stickersKeys" | "keys";
  let what = $state<What>(initialKeysOnly ? "keys" : "stickersKeys");
  let keys = $derived(what !== "stickers");
  let keysOnly = $derived(what === "keys");
  let chosenOutput = $state<"stickers" | "copies">("stickers");
  let output = $derived(fixedOutput ?? chosenOutput);
  let progress = $state("");
  let copiesMode = $derived(output === "copies" && !copiesUnavailable);
  // Key slips alone print on plain paper: no labels, so no copies or used cells.
  let onlyKeys = $derived(!copiesMode && keysOnly);
  // Personalised page codes name the student by sticker ID (issue #220): a shared ID blocks copies, a missing one leaves only the cover code.
  let idIssues = $derived(copiesMode ? stickerIdIssues(entries ?? examEntries) : null);
  let error = $state("");

  onMount(async () => {
    if (entries) {
      loading = false;
      return;
    }
    try {
      await awaitSessionReady();
      examEntries = await loadStickerEntries(examId, get(sessionStore).sessionKey);
    } catch (err) {
      // A failed read is reported, never shown as "no students yet" (issue #212).
      loadError = `${$t("sharing.stickers.loadFailed")} ${err instanceof Error ? err.message : ""}`.trim();
    } finally {
      loading = false;
    }
  });

  const clamp = (value: string, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number(value) || 0)));

  function deliver(pdf: Uint8Array, kind: "stickers" | "copies" | "keys", fileName: string, download?: SavedFile) {
    if (onPdf) onPdf(pdf, kind, fileName, download);
    else if (download) downloadBlob(new Blob([download.bytes as BlobPart], { type: download.type }), download.fileName);
    else downloadBlob(new Blob([pdf as BlobPart], { type: "application/pdf" }), fileName);
    onDone?.(kind);
  }

  /** The copies as the chosen print way needs them: A4 one after the other, A3 booklets, or (for the printer's booklet function) a ZIP with one A4 file per student. */
  async function deliverCopies(list: StickerEntry[], examPdf: Uint8Array) {
    const issues = stickerIdIssues(list);
    if (issues.duplicates.length) throw new Error($t("sharing.stickers.idDuplicates", { names: issues.duplicates.join(", ") }));
    const { pdf, pagesPerCopy } = await renderExamCopies(examPdf, list, { examTitle, examId });
    const base = slug(examTitle || $t("sharing.stickers.copiesTitle"));
    if (booklet === "impose") {
      deliver(await imposeBooklet(pdf, pagesPerCopy), "copies", `${base}_booklets.pdf`);
      return;
    }
    if (booklet === "printer") {
      const zip = new ZipBuilder();
      const files = await splitCopies(pdf, pagesPerCopy, list.map((e, i) => `${String(i + 1).padStart(3, "0")}_${slug(e.label)}`));
      for (const file of files) zip.add(`${file.name}.pdf`, file.pdf);
      deliver(pdf, "copies", `${base}_copies.pdf`, { bytes: zip.toBytes(), fileName: `${base}_copies.zip`, type: "application/zip" });
      return;
    }
    deliver(pdf, "copies", `${base}_copies.pdf`);
  }

  async function download() {
    busy = true;
    error = "";
    try {
      const list = entries ?? examEntries;
      if (!list.length) {
        error = $t("sharing.stickers.empty");
        return;
      }
      if (copiesMode && loadExamPdf) {
        progress = $t("sharing.stickers.compiling");
        await deliverCopies(list, await loadExamPdf());
        return;
      }
      const pdf = await renderStickerSheet(list, {
        copies: clamp(copies, 1, 10),
        skip: clamp(skip, 0, STICKER_GRID.cols * STICKER_GRID.rows - 1),
        keys,
        keysOnly: onlyKeys,
      });
      deliver(pdf, onlyKeys ? "keys" : "stickers", `${slug(examTitle || $t("sharing.stickers.pdfTitle"))}${onlyKeys ? "_keys" : "_qr"}.pdf`);
    } catch (err) {
      error = `${$t("sharing.errors.stickers")} ${err instanceof Error ? err.message : ""}`.trim();
    } finally {
      busy = false;
      progress = "";
    }
  }

  $effect.pre(() => {
    untrack(() => (create = download));
  });

  // The page learns the sheet count after its PDF loads: the count field follows until it is edited.
  let suggested = untrack(() => stickersPerStudent);
  $effect.pre(() => {
    const next = stickersPerStudent;
    untrack(() => {
      if (copies === String(suggested)) copies = String(next);
      suggested = next;
    });
  });
</script>

<div class="flex flex-col gap-3">
  {#if loadExamPdf && !initialKeysOnly && !fixedOutput}
    <fieldset class="flex flex-col gap-2" disabled={busy}>
      <legend class="mb-2 text-sm text-muted">{$t("sharing.stickers.output")}</legend>
      <Radio group={output} value="stickers" name="sticker-output" onchange={() => (chosenOutput = "stickers")} label={$t("sharing.stickers.outputStickers")} />
      <Radio
        group={output}
        value="copies"
        name="sticker-output"
        disabled={!!copiesUnavailable}
        onchange={() => (chosenOutput = "copies")}
        label={$t("sharing.stickers.outputCopies")}
      />
      {#if copiesUnavailable}<p class="ml-7 text-sm text-muted">{copiesUnavailable}</p>{/if}
    </fieldset>
  {/if}

  {#if !fixedOutput}
  <p class="m-0 text-sm text-muted">{copiesMode ? $t("sharing.stickers.copiesIntro") : $t("sharing.stickers.intro")}</p>

  <!-- Student data is entered only on the Students page; this form prints what is there. -->
  <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
    {#if loadError}
      <Alert severity="danger" class="w-full">{loadError}</Alert>
    {:else if loading}
      <span class="text-muted">{$t("sharing.share.loading")}</span>
    {:else if examEntries.length}
      <span>{$t("sharing.stickers.examCount", { count: examEntries.length })}</span>
    {:else}
      <span class="text-warning-fg">{$t("lms.students.noneYet")}</span>
    {/if}
    <Button size="sm" variant="text" icon={actionIcons.edit} href={studentsHref(examId)}>{$t("lms.students.manage")}</Button>
  </div>
  {:else if loadError}
    <Alert severity="danger">{loadError}</Alert>
  {/if}

  {#if idIssues?.duplicates.length}
    <Alert severity="danger">{$t("sharing.stickers.idDuplicates", { names: idIssues.duplicates.join(", ") })} <a href={studentsHref(examId)}>{$t("lms.students.manage")}</a></Alert>
  {:else if idIssues?.missing.length}
    <Alert severity="warning">{$t("sharing.stickers.idMissing", { names: idIssues.missing.join(", ") })} <a href={studentsHref(examId)}>{$t("lms.students.manage")}</a></Alert>
  {/if}

  {#if copiesMode}
    <p class="m-0 text-sm text-muted">{$t(booklet ? "sharing.stickers.copiesBookletHint" : "sharing.stickers.copiesPrintHint")}</p>
  {:else}
    <fieldset class="m-0 flex flex-col gap-1.5 border-0 p-0" disabled={busy}>
      <legend class="mb-1 text-sm font-medium">{$t("sharing.stickers.what")}</legend>
      <div class="flex items-center gap-1">
        <Radio group={what} value="stickersKeys" name="sticker-what-{examId}" onchange={() => (what = "stickersKeys")} label={$t("sharing.stickers.whatStickersKeys")} />
        <InfoTip text={$t("sharing.stickers.keysHint")} />
      </div>
      <Radio group={what} value="stickers" name="sticker-what-{examId}" onchange={() => (what = "stickers")} label={$t("sharing.stickers.whatStickers")} />
      <div class="flex items-center gap-1">
        <Radio group={what} value="keys" name="sticker-what-{examId}" onchange={() => (what = "keys")} label={$t("sharing.stickers.whatKeys")} />
        <InfoTip text={$t("sharing.stickers.keysOnlyHint")} />
      </div>
    </fieldset>
    {#if !onlyKeys}
      <!-- Two small number fields on one line. -->
      <div class="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <label class="flex items-center gap-2 whitespace-nowrap">
          <span class="w-16 shrink-0"><TextInput size="sm" type="number" min="1" max="10" bind:value={copies} disabled={busy} /></span>
          {$t("sharing.stickers.copies")}
        </label>
        <label class="flex items-center gap-2 whitespace-nowrap">
          <span class="w-16 shrink-0"><TextInput size="sm" type="number" min="0" max={STICKER_GRID.cols * STICKER_GRID.rows - 1} bind:value={skip} disabled={busy} /></span>
          {$t("sharing.stickers.skip")}
        </label>
        <InfoTip text={$t("sharing.stickers.skipHint")} />
      </div>
    {/if}
  {/if}

  {#if error}<Alert severity="danger">{error}</Alert>{/if}

  {#if onPdf}
    {#if progress}<span class="text-sm text-muted" role="status">{progress}</span>{/if}
  {:else}
  <div class="flex flex-wrap items-center justify-end gap-2">
    {#if progress}<span class="text-sm text-muted" role="status">{progress}</span>{/if}
    <Button icon={actionIcons.qr} loading={busy} disabled={busy || !!loadError || loading || (fixedOutput !== undefined && !(entries ?? examEntries).length)} onClick={download}>{$t("sharing.stickers.download")}</Button>
  </div>
  {/if}
</div>
