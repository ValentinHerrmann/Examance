<script lang="ts">
  import { untrack } from "svelte";
  import type { GradingKeyConfig } from '#lib/db/schema';
  import GradingKeyEditor from '#lib/components/GradingKeyEditor.svelte';
  import LatexEditor from '#lib/components/LatexEditor.svelte';
  import SuggestField from '#lib/components/common/SuggestField.svelte';
  import { recordValue } from '#lib/utils/recentValues';
  import { formatExamCourse, parseDatumAndDauer, formatDatumAndDauer } from '#lib/utils/examLabel';
  import { t } from '#lib/i18n';
  import { Modal, Button, Checkbox, Field, controlClass } from '#lib/components/ui';
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
    <Field label={$t("exam.metadataEditor.examTitle")} forId="editTitle">
      {#snippet children({ id })}
        <input {id} type="text" bind:value={editTitle} maxlength={500} class={controlClass} />
      {/snippet}
    </Field>
    <SuggestField id="editTestart" label={$t("exam.metadataEditor.testart")} storageKey="exam.testart" bind:value={editTestart} maxlength={100} />
    <SuggestField id="editGrade" label={$t("exam.metadataEditor.grade")} storageKey="exam.grade" bind:value={editGrade} maxlength={50} placeholder="10" />
    <SuggestField id="editKlasse" label={$t("exam.metadataEditor.klasse")} storageKey="exam.klasse" bind:value={editKlasse} maxlength={50} placeholder="a" />
    {#if fullCoursePreview}
      <div class="flex flex-col gap-1 @3xl:col-span-2">
        <div class="mt-1 flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface-raised px-3 py-2 text-sm text-muted">
          <span>{$t("exam.metadataEditor.coursePreview")} <code class="rounded-sm bg-highlight px-1.5 py-0.5 font-mono text-accent">\Klasse&#123;{fullCoursePreview}&#125;</code>:</span>
          <span class="rounded-md bg-highlight px-2 py-0.5 font-semibold text-accent">{fullCoursePreview}</span>
        </div>
      </div>
    {/if}
    <Field label={$t("exam.metadataEditor.datum")} forId="editDatumDate">
      {#snippet children({ id })}
        <input {id} type="text" bind:value={editDatumDate} oninput={handleDatumDateOrDauerChange} placeholder="14.08.2026" class={controlClass} />
      {/snippet}
    </Field>
    <SuggestField id="editDauer" label={$t("exam.metadataEditor.dauer")} storageKey="exam.dauer" bind:value={editDauer} oninput={handleDatumDateOrDauerChange} placeholder="30 Min" />
    <Field label={$t("exam.metadataEditor.nr")} forId="editNr">
      {#snippet children({ id })}
        <input {id} type="text" bind:value={editNr} maxlength={10} class={controlClass} />
      {/snippet}
    </Field>
    <SuggestField id="editFach" label={$t("exam.metadataEditor.fach")} storageKey="exam.fach" bind:value={editFach} maxlength={100} />
    <SuggestField id="editLehrernachname" label={$t("exam.metadataEditor.lehrernachname")} storageKey="exam.lehrernachname" bind:value={editLehrernachname} maxlength={100} />
    <Field label={$t("exam.metadataEditor.retentionUntil")} forId="editRetention">
      {#snippet children({ id })}
        <input {id} type="date" bind:value={editRetentionUntil} class={controlClass} />
      {/snippet}
    </Field>
    <SuggestField
      id="editTopic"
      label={$t("exam.metadataEditor.topic")}
      hint={$t("exam.metadataEditor.topicHint")}
      storageKey="exam.topic"
      extraSuggestions={topicSuggestions}
      bind:value={editTopic}
      maxlength={200}
      placeholder={$t("exam.metadataEditor.topicPlaceholder")}
      class="@3xl:col-span-2"
    />
  </div>

  <Field label={$t("exam.metadataEditor.infoText")} class="mb-4">
    <LatexEditor bind:value={editInfoText} rows={4} />
  </Field>

  <Field hint={$t("exam.metadataEditor.nameLineHint")} class="mb-4">
    <Checkbox id="editNameLine" bind:checked={editNameLine} label={$t("exam.metadataEditor.nameLine")} />
  </Field>

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
