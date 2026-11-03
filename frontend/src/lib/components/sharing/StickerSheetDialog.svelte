<script lang="ts">
  /** Prints QR name stickers, optionally with personal key slips (issues #83, #207), or the QR codes directly onto personalised exam copies (issue #211). It prints the exam's students as entered on the Students page, or only their key slips (reprint of lost keys). */
  import { onMount, untrack } from "svelte";
  import { get } from "svelte/store";
  import { faQrcode } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Button, Checkbox, Field, Modal, Radio, TextInput } from "#lib/components/ui";
  import { downloadBlob } from "#lib/components/stats/chartExport";
  import { slug } from "#lib/export/zip";
  import { renderExamCopies } from "#lib/qr/examCopies";
  import { renderStickerSheet, STICKER_GRID, type StickerEntry } from "#lib/qr/stickerSheet";
  import { studentRepository } from "#lib/repositories/studentRepository";
  import { awaitSessionReady, sessionStore } from "#lib/stores/session";
  import { formatStudentName, stickerRawOf } from "#lib/utils/studentQr";
  import { studentsHref } from "#lib/utils/links";

  interface Props {
    /** Prints the exam's students (entered on the Students page). */
    examId: string;
    examTitle?: string;
    /** Starts with the exam's students and only the key slips (from the share dialog). */
    keysOnly?: boolean;
    /** The compiled student sheet; offers printing onto exam copies. */
    loadExamPdf?: () => Promise<Uint8Array>;
    /** The exam keeps the cut-off corner free, which exam copies need. */
    onClose: () => void;
  }

  let { examId, examTitle = "", keysOnly: startKeysOnly = false, loadExamPdf, onClose }: Props = $props();

  // The starting choice only; the dialog owns it from then on.
  const initialKeysOnly = untrack(() => startKeysOnly);
  let examEntries = $state.raw<StickerEntry[]>([]);
  let copies = $state("1");
  let skip = $state("0");
  let keys = $state(true);
  let keysOnly = $state(initialKeysOnly);
  let output = $state<"stickers" | "copies">("stickers");
  let busy = $state(false);
  let progress = $state("");
  let copiesMode = $derived(output === "copies");
  // Key slips alone print on plain paper: no labels, so no copies or used cells.
  let onlyKeys = $derived(!copiesMode && keysOnly);
  let error = $state("");

  onMount(async () => {
    try {
      await awaitSessionReady();
      const students = await studentRepository.getByExamId(examId, get(sessionStore).sessionKey);
      examEntries = students.flatMap((st) => {
        const raw = stickerRawOf(st);
        return raw ? [{ label: formatStudentName(st.studentName) || raw, payload: raw }] : [];
      });
    } catch {
      examEntries = [];
    }
  });

  const clamp = (value: string, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number(value) || 0)));

  async function download() {
    busy = true;
    error = "";
    try {
      const entries = examEntries;
      if (!entries.length) {
        error = $t("sharing.stickers.empty");
        return;
      }
      if (copiesMode && loadExamPdf) {
        progress = $t("sharing.stickers.compiling");
        const pdf = await renderExamCopies(await loadExamPdf(), entries, { examTitle });
        downloadBlob(new Blob([pdf as BlobPart], { type: "application/pdf" }), `${slug(examTitle || $t("sharing.stickers.copiesTitle"))}_copies.pdf`);
        onClose();
        return;
      }
      const pdf = await renderStickerSheet(entries, {
        copies: clamp(copies, 1, 10),
        skip: clamp(skip, 0, STICKER_GRID.cols * STICKER_GRID.rows - 1),
        keys,
        keysOnly: onlyKeys,
      });
      downloadBlob(new Blob([pdf as BlobPart], { type: "application/pdf" }), `${slug(examTitle || $t("sharing.stickers.pdfTitle"))}${onlyKeys ? "_keys" : "_qr"}.pdf`);
      onClose();
    } catch (err) {
      error = `${$t("sharing.errors.stickers")} ${err instanceof Error ? err.message : ""}`.trim();
    } finally {
      busy = false;
      progress = "";
    }
  }
</script>

<Modal open={true} size="medium" title={$t("sharing.stickers.title")} onClose={busy ? undefined : onClose} closeOnEscape={!busy} {error}>
  <div class="flex flex-col gap-5">
    {#if loadExamPdf && !initialKeysOnly}
      <fieldset class="flex flex-col gap-2" disabled={busy}>
        <legend class="mb-2 text-sm text-muted">{$t("sharing.stickers.output")}</legend>
        <Radio group={output} value="stickers" name="sticker-output" onchange={() => (output = "stickers")} label={$t("sharing.stickers.outputStickers")} />
        <Radio group={output} value="copies" name="sticker-output" onchange={() => (output = "copies")} label={$t("sharing.stickers.outputCopies")} />
      </fieldset>
    {/if}

    <p class="text-sm text-muted">{copiesMode ? $t("sharing.stickers.copiesIntro") : $t("sharing.stickers.intro")}</p>

    <!-- Student data is entered only on the Students page; this dialog prints what is there. -->
    <div class="flex flex-wrap items-center justify-between gap-2 text-sm">
      {#if examEntries.length}
        <span>{$t("sharing.stickers.examCount", { count: examEntries.length })}</span>
      {:else}
        <span class="text-warning-fg">{$t("lms.students.noneYet")}</span>
      {/if}
      <Button size="sm" variant="text" href={studentsHref(examId)}>{$t("lms.students.manage")}</Button>
    </div>

    {#if copiesMode}
      <p class="text-sm text-muted">{$t("sharing.stickers.copiesPrintHint")}</p>
    {:else if !onlyKeys}
      <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={$t("sharing.stickers.copies")}>
          {#snippet children({ id })}
            <TextInput {id} type="number" min="1" max="10" bind:value={copies} disabled={busy} />
          {/snippet}
        </Field>
        <Field label={$t("sharing.stickers.skip")}>
          {#snippet children({ id })}
            <TextInput {id} type="number" min="0" max={STICKER_GRID.cols * STICKER_GRID.rows - 1} bind:value={skip} disabled={busy} />
          {/snippet}
        </Field>
      </div>
    {/if}

    <div class="flex flex-col gap-3" class:hidden={copiesMode}>
      <div>
        <Checkbox bind:checked={keys} label={$t("sharing.stickers.keys")} disabled={busy || onlyKeys} />
        <p class="ml-7 text-sm text-muted">{$t("sharing.stickers.keysHint")}</p>
      </div>
      <div>
        <Checkbox bind:checked={keysOnly} label={$t("sharing.stickers.keysOnly")} disabled={busy} />
        <p class="ml-7 text-sm text-muted">{$t("sharing.stickers.keysOnlyHint")}</p>
      </div>
    </div>
  </div>

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" disabled={busy} onClick={onClose}>{$t("common.cancel")}</Button>
    {#if progress}<span class="text-sm text-muted" role="status">{progress}</span>{/if}
    <Button icon={faQrcode} loading={busy} disabled={busy} onClick={download}>{$t("sharing.stickers.download")}</Button>
  {/snippet}
</Modal>
