<script lang="ts">
  import { untrack } from "svelte";
  import type { GradingKeyConfig } from '#lib/db/schema';
  import GradingKeyEditor from '#lib/components/GradingKeyEditor.svelte';
  import LatexEditor from '#lib/components/LatexEditor.svelte';
  import SuggestInput from '#lib/components/common/SuggestInput.svelte';
  import { recordValue } from '#lib/utils/recentValues';
  import { formatExamCourse, parseDatumAndDauer, formatDatumAndDauer } from '#lib/utils/examLabel';
  import { t } from '#lib/i18n';
  import { Modal, Button, Checkbox, controlClass } from '#lib/components/ui';
  import ExamLogoField from '#lib/components/logo/ExamLogoField.svelte';
  import ExamPackagesField from '#lib/components/latex-packages/ExamPackagesField.svelte';
  import type { LatexPackageEntry } from '#lib/latex/packages';
  import type { ExamLogoChange } from '#lib/latex/logo';

  interface Props {
    isOpen?: boolean;
    editTitle: string;
    editTestart: string;
    editGrade?: string;
    editKlasse?: string;
    editDatum: string;
    editNr: string;
    editFach: string;
    editTopic?: string;
    /** Topics of the exam's exercises, offered next to the previously used exam topics. */
    topicSuggestions?: string[];
    editLehrernachname: string;
    editInfoText: string;
    /** Name line next to the QR box (issue #127). */
    editNameLine?: boolean;
    editRetentionUntil: string;
    editGradingKey: GradingKeyConfig;
    /** Exam whose logo choice is edited; the staged choice lands in `logoChange`. */
    examId?: string;
    logoChange?: ExamLogoChange | null;
    /** The exam's LaTeX package additions (issue #108); null follows the account. */
    editLatexPackages?: LatexPackageEntry[] | null;
    /** The exam's exercises, for the package result. */
    packageSources?: { label: string; latex: string }[];
    /** Create mode ("New exam", M1): own heading and save label, logo and packages come later in the editor. */
    create?: boolean;
    /** Inline error (e.g. a refused create). */
    error?: string;
    busy?: boolean;
    onSave: () => void;
    onCancel: () => void;
  }

  let {
    isOpen = false,
    editTitle = $bindable(),
    editTestart = $bindable(),
    editGrade = $bindable(""),
    editKlasse = $bindable(""),
    editDatum = $bindable(),
    editNr = $bindable(),
    editFach = $bindable(),
    editTopic = $bindable(""),
    topicSuggestions = [],
    editLehrernachname = $bindable(),
    editInfoText = $bindable(),
    editNameLine = $bindable(false),
    editRetentionUntil = $bindable(),
    editGradingKey = $bindable(),
    examId = undefined,
    logoChange = $bindable(null),
    editLatexPackages = $bindable(null),
    packageSources = [],
    create = false,
    error = "",
    busy = false,
    onSave,
    onCancel
  }: Props = $props();

  let fullCoursePreview = $derived(formatExamCourse(editGrade, editKlasse));

  let editDatumDate = $state("");
  let editDauer = $state("");
  let lastSyncedEditDatum = "";

  function handleDatumDateOrDauerChange() {
    const formatted = formatDatumAndDauer(editDatumDate, editDauer);
    editDatum = formatted;
    lastSyncedEditDatum = formatted;
  }

  function handleSave() {
    handleDatumDateOrDauerChange();
    if (editTestart) recordValue("exam.testart", editTestart);
    if (editGrade) recordValue("exam.grade", editGrade);
    if (editKlasse) recordValue("exam.klasse", editKlasse);
    if (editFach) recordValue("exam.fach", editFach);
    if (editTopic) recordValue("exam.topic", editTopic);
    if (editLehrernachname) recordValue("exam.lehrernachname", editLehrernachname);
    if (editDauer) recordValue("exam.dauer", editDauer);
    onSave();
  }

  $effect.pre(() => {
    const d = editDatum;
    untrack(() => {
      if (d !== lastSyncedEditDatum) {
        lastSyncedEditDatum = d;
        const parsed = parseDatumAndDauer(d);
        editDatumDate = parsed.datumDate;
        editDauer = parsed.dauer;
      }
    });
  });
</script>

<Modal
  open={isOpen}
  size="large"
  title={create ? $t("exam.metadataEditor.createHeading") : $t("exam.metadataEditor.heading")}
  {error}
  onClose={onCancel}
>
  <div class="mb-4 grid grid-cols-1 gap-4 @3xl:grid-cols-2">
    <div class="flex flex-col gap-1">
      <label for="editTitle" class="text-sm font-medium text-content">{$t("exam.metadataEditor.examTitle")}</label>
      <input id="editTitle" type="text" bind:value={editTitle} maxlength={500} class={controlClass} />
    </div>
    <div class="flex flex-col gap-1">
      <label for="editTestart" class="text-sm font-medium text-content">{$t("exam.metadataEditor.testart")}</label>
      <SuggestInput id="editTestart" storageKey="exam.testart" bind:value={editTestart} maxlength={100} class={controlClass} />
    </div>
    <div class="flex flex-col gap-1">
      <label for="editGrade" class="text-sm font-medium text-content">{$t("exam.metadataEditor.grade")}</label>
      <SuggestInput id="editGrade" storageKey="exam.grade" bind:value={editGrade} maxlength={50} placeholder="10" class={controlClass} />
    </div>
    <div class="flex flex-col gap-1">
      <label for="editKlasse" class="text-sm font-medium text-content">{$t("exam.metadataEditor.klasse")}</label>
      <SuggestInput id="editKlasse" storageKey="exam.klasse" bind:value={editKlasse} maxlength={50} placeholder="a" class={controlClass} />
    </div>
    {#if fullCoursePreview}
      <div class="flex flex-col gap-1 @3xl:col-span-2">
        <div class="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-muted">
          <span>{$t("exam.metadataEditor.coursePreview")} <code class="rounded-sm bg-highlight px-1.5 py-0.5 font-mono text-accent">\Klasse&#123;{fullCoursePreview}&#125;</code>:</span>
          <span class="rounded-md bg-highlight px-2 py-0.5 font-semibold text-accent">{fullCoursePreview}</span>
        </div>
      </div>
    {/if}
    <div class="flex flex-col gap-1">
      <label for="editDatumDate" class="text-sm font-medium text-content">{$t("exam.metadataEditor.datum")}</label>
      <input id="editDatumDate" type="text" bind:value={editDatumDate} oninput={handleDatumDateOrDauerChange} placeholder="14.08.2026" class={controlClass} />
    </div>
    <div class="flex flex-col gap-1">
      <label for="editDauer" class="text-sm font-medium text-content">{$t("exam.metadataEditor.dauer")}</label>
      <SuggestInput id="editDauer" storageKey="exam.dauer" bind:value={editDauer} oninput={handleDatumDateOrDauerChange} placeholder="30 Min" class={controlClass} />
    </div>
    <div class="flex flex-col gap-1">
      <label for="editNr" class="text-sm font-medium text-content">{$t("exam.metadataEditor.nr")}</label>
      <input id="editNr" type="text" bind:value={editNr} maxlength={10} class={controlClass} />
    </div>
    <div class="flex flex-col gap-1">
      <label for="editFach" class="text-sm font-medium text-content">{$t("exam.metadataEditor.fach")}</label>
      <SuggestInput id="editFach" storageKey="exam.fach" bind:value={editFach} maxlength={100} class={controlClass} />
    </div>
    <div class="flex flex-col gap-1">
      <label for="editLehrernachname" class="text-sm font-medium text-content">{$t("exam.metadataEditor.lehrernachname")}</label>
      <SuggestInput id="editLehrernachname" storageKey="exam.lehrernachname" bind:value={editLehrernachname} maxlength={100} class={controlClass} />
    </div>
    <div class="flex flex-col gap-1">
      <label for="editRetention" class="text-sm font-medium text-content">{$t("exam.metadataEditor.retentionUntil")}</label>
      <input id="editRetention" type="date" bind:value={editRetentionUntil} class={controlClass} />
    </div>
    <div class="flex flex-col gap-1 @3xl:col-span-2">
      <label for="editTopic" class="text-sm font-medium text-content">{$t("exam.metadataEditor.topic")}</label>
      <SuggestInput id="editTopic" storageKey="exam.topic" extraSuggestions={topicSuggestions} bind:value={editTopic} maxlength={200} placeholder={$t("exam.metadataEditor.topicPlaceholder")} class={controlClass} />
      <p class="m-0 text-sm text-muted">{$t("exam.metadataEditor.topicHint")}</p>
    </div>
  </div>

  <div class="mb-4 flex flex-col gap-1">
    <span class="text-sm font-medium text-content">{$t("exam.metadataEditor.infoText")}</span>
    <LatexEditor bind:value={editInfoText} rows={4} />
  </div>

  <div class="mb-4 flex flex-col gap-1">
    <Checkbox id="editNameLine" bind:checked={editNameLine} label={$t("exam.metadataEditor.nameLine")} />
    <p class="m-0 text-sm text-muted">{$t("exam.metadataEditor.nameLineHint")}</p>
  </div>

  {#if examId && isOpen}
    <div class="mb-4">
      <ExamLogoField {examId} bind:change={logoChange} />
    </div>
    <div class="mb-4">
      <ExamPackagesField bind:packages={editLatexPackages} exerciseSources={packageSources} />
    </div>
  {/if}

  <div class="mt-2">
    <GradingKeyEditor bind:gradingKey={editGradingKey} />
  </div>

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" onClick={onCancel}>{$t("common.cancel")}</Button>
    <Button onClick={handleSave} loading={busy} disabled={busy || (create && !editTitle.trim())}>
      {create ? $t("exam.metadataEditor.createButton") : $t("common.save")}
    </Button>
  {/snippet}
</Modal>
