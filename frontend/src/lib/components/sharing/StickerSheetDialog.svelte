<script lang="ts">
  /** Prints QR name stickers, optionally with personal key slips (issues #83, #207). From an exam it can also start from the exam's students, e.g. to print only the keys for stickers already in use. */
  import { onMount, untrack } from "svelte";
  import { get } from "svelte/store";
  import { faQrcode } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Button, Checkbox, Field, Modal, Radio, Textarea, TextInput } from "#lib/components/ui";
  import { downloadBlob } from "#lib/components/stats/chartExport";
  import { slug } from "#lib/export/zip";
  import { entriesFromRoster, renderStickerSheet, STICKER_GRID, type StickerEntry } from "#lib/qr/stickerSheet";
  import { studentRepository } from "#lib/repositories/studentRepository";
  import { awaitSessionReady, sessionStore } from "#lib/stores/session";
  import { formatStudentName, stickerRawOf } from "#lib/utils/studentQr";
  import ArtemisConnect from "#lib/components/lms/ArtemisConnect.svelte";
  import ClassListFile from "#lib/components/lms/ClassListFile.svelte";
  import type { ArtemisStudent } from "#lib/api/integrations";
  import type { Contact } from "#lib/lms/contacts";
  import { featuresStore } from "#lib/stores/capabilities";

  interface Props {
    /** Offers the exam's students as a source. */
    examId?: string;
    examTitle?: string;
    /** Starts with the exam's students and only the key slips (from the share dialog). */
    keysOnly?: boolean;
    onClose: () => void;
  }

  let { examId, examTitle = "", keysOnly: startKeysOnly = false, onClose }: Props = $props();

  // The starting choice only; the dialog owns it from then on.
  const initialKeysOnly = untrack(() => startKeysOnly);
  let source = $state<"roster" | "exam">(initialKeysOnly ? "exam" : "roster");
  let roster = $state("");
  let examEntries = $state.raw<StickerEntry[]>([]);
  let copies = $state("1");
  let skip = $state("0");
  let keys = $state(true);
  let keysOnly = $state(initialKeysOnly);
  let busy = $state(false);
  // Key slips alone print on plain paper: no labels, so no copies or used cells.
  let onlyKeys = $derived(source === "exam" && keysOnly);
  let error = $state("");

  onMount(async () => {
    if (!examId) return;
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

  let showArtemis = $state(false);

  // An imported list lands in the text field, so the teacher sees and can correct it before printing.
  function fillRoster(contacts: readonly Contact[]) {
    roster = contacts.map((c) => (c.id ? `${c.name}; ${c.id}` : c.name)).join("\n");
  }

  const fromArtemis = (students: ArtemisStudent[]) => fillRoster(students.map((s) => ({ name: s.name, id: String(s.id), email: s.email })));

  const clamp = (value: string, min: number, max: number) => Math.min(max, Math.max(min, Math.floor(Number(value) || 0)));

  async function download() {
    busy = true;
    error = "";
    try {
      const entries = source === "exam" ? examEntries : await entriesFromRoster(roster);
      if (!entries.length) {
        error = $t("sharing.stickers.empty");
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
    }
  }
</script>

<Modal open={true} size="medium" title={$t("sharing.stickers.title")} onClose={busy ? undefined : onClose} closeOnEscape={!busy} {error}>
  <div class="flex flex-col gap-5">
    <p class="text-sm text-muted">{$t("sharing.stickers.intro")}</p>

    {#if examId}
      <fieldset class="flex flex-col gap-2" disabled={busy}>
        <legend class="mb-2 text-sm text-muted">{$t("sharing.stickers.source")}</legend>
        <Radio group={source} value="roster" name="sticker-source" onchange={() => (source = "roster")} label={$t("sharing.stickers.sourceRoster")} />
        <Radio
          group={source}
          value="exam"
          name="sticker-source"
          onchange={() => (source = "exam")}
          disabled={!examEntries.length}
          label={examEntries.length ? $t("sharing.stickers.examCount", { count: examEntries.length }) : $t("sharing.stickers.examNone")}
        />
      </fieldset>
    {/if}

    {#if source === "roster"}
      <Field label={$t("sharing.stickers.rosterLabel")} hint={$t("sharing.stickers.rosterHint")}>
        {#snippet children({ id })}
          <Textarea {id} rows={8} bind:value={roster} placeholder={$t("sharing.stickers.rosterPlaceholder")} disabled={busy} />
        {/snippet}
      </Field>
      <div class="flex flex-col gap-3 rounded-md border border-line p-3">
        <p class="m-0 text-sm font-semibold">{$t("lms.importTitle")}</p>
        <ClassListFile disabled={busy} onContacts={(contacts) => fillRoster(contacts)} />
        {#if $featuresStore.result_delivery}
          {#if showArtemis}
            <ArtemisConnect disabled={busy} onLoaded={fromArtemis} />
          {:else}
            <div><Button size="sm" variant="text" disabled={busy} onClick={() => (showArtemis = true)}>{$t("lms.artemis.fromCourse")}</Button></div>
          {/if}
        {/if}
      </div>
    {/if}

    {#if !onlyKeys}
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

    <div class="flex flex-col gap-3">
      <div>
        <Checkbox bind:checked={keys} label={$t("sharing.stickers.keys")} disabled={busy || onlyKeys} />
        <p class="ml-7 text-sm text-muted">{$t("sharing.stickers.keysHint")}</p>
      </div>
      {#if source === "exam"}
        <div>
          <Checkbox bind:checked={keysOnly} label={$t("sharing.stickers.keysOnly")} disabled={busy} />
          <p class="ml-7 text-sm text-muted">{$t("sharing.stickers.keysOnlyHint")}</p>
        </div>
      {/if}
    </div>
  </div>

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" disabled={busy} onClick={onClose}>{$t("common.cancel")}</Button>
    <Button icon={faQrcode} loading={busy} disabled={busy} onClick={download}>{$t("sharing.stickers.download")}</Button>
  {/snippet}
</Modal>
