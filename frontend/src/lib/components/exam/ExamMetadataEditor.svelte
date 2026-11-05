<script lang="ts">
  import { untrack } from "svelte";
  import SuggestField from '#lib/components/common/SuggestField.svelte';
  import OverridableText from '#lib/components/exam/OverridableText.svelte';
  import { recordValue } from '#lib/utils/recentValues';
  import { formatExamCourse, generatedExamTitle, parseDatumAndDauer, formatDatumAndDauer } from '#lib/utils/examLabel';
  import { t, translate } from '#lib/i18n';
  import { Alert, Modal, Button, Field, actionIcons, controlClass, controlCompactClass } from '#lib/components/ui';

  interface Props {
    isOpen?: boolean;
    /** Generated from the other fields until the teacher overrides it (`generatedExamTitle`, issue #212). */
    editTitle: string;
    editTestart: string;
    editGrade?: string;
    editKlasse?: string;
    /** Printed course override; empty means grade + klasse. */
    editCourse?: string;
    editDatum: string;
    editNr: string;
    editFach: string;
    editTopic?: string;
    /** Topics of the exam's exercises, offered next to the previously used exam topics. */
    topicSuggestions?: string[];
    editLehrernachname: string;
    editRetentionUntil: string;
    /** Create mode ("New exam", M1): own heading and save label; layout and grading key are set later on the Exam and Results pages (issue #212). */
    create?: boolean;
    /** Inline error (e.g. a refused create). */
    error?: string;
    busy?: boolean;
    /** Renders the fields in place (the Overview page, issue #212) instead of a dialog; Save and Discard then appear only once something changed. */
    inline?: boolean;
    /** Inline mode: unsaved changes exist. */
    dirty?: boolean;
    onSave: () => void;
    onCancel: () => void;
  }

  let {
    isOpen = false,
    editTitle = $bindable(),
    editTestart = $bindable(),
    editGrade = $bindable(""),
    editKlasse = $bindable(""),
    editCourse = $bindable(""),
    editDatum = $bindable(),
    editNr = $bindable(),
    editFach = $bindable(),
    editTopic = $bindable(""),
    topicSuggestions = [],
    editLehrernachname = $bindable(),
    editRetentionUntil = $bindable(),
    create = false,
    error = "",
    busy = false,
    inline = false,
    dirty = true,
    onSave,
    onCancel
  }: Props = $props();

  let editDatumDate = $state("");
  let editDauer = $state("");
  let lastSyncedEditDatum = "";

  const generateTitle = () =>
    generatedExamTitle(
      { testart: editTestart, nr: editNr, fach: editFach, grade: editGrade, klasse: editKlasse, course: editCourse, datum: editDatum },
      translate("exam.nav.examFallback"),
    );
  let generatedTitle = $derived(generateTitle());
  // Generated or custom is decided by comparison, so no flag is stored; an empty title counts as generated.
  let titleCustom = $derived(!!editTitle.trim() && editTitle !== generatedTitle);
  let derivedCourse = $derived(formatExamCourse(editGrade, editKlasse));
  let courseCustom = $derived(!!editCourse?.trim());
  // The title the fields generated last time: a title still equal to it follows the next change.
  let lastGenerated = untrack(() => generateTitle());

  function handleDatumDateOrDauerChange() {
    const formatted = formatDatumAndDauer(editDatumDate, editDauer);
    editDatum = formatted;
    lastSyncedEditDatum = formatted;
  }

  function handleSave() {
    handleDatumDateOrDauerChange();
    if (!editTitle.trim()) editTitle = generatedTitle;
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

  $effect.pre(() => {
    const g = generatedTitle;
    untrack(() => {
      if (!editTitle.trim() || editTitle === lastGenerated) editTitle = g;
      lastGenerated = g;
    });
  });

  const field = "min-w-0";
  const input = `${controlClass} ${controlCompactClass}`;
</script>

{#snippet fields()}
  <OverridableText
    class="mb-3"
    text={editTitle || generatedTitle}
    custom={titleCustom}
    label={$t("exam.metadataEditor.examTitle")}
    editLabel={$t("exam.metadataEditor.titleEdit")}
    resetLabel={$t("exam.metadataEditor.titleReset")}
    customLabel={$t("exam.metadataEditor.titleCustom")}
    hint={$t("exam.metadataEditor.titleHint")}
    onChange={(v) => (editTitle = v)}
    onReset={() => (editTitle = generatedTitle)}
  />
  <!-- 12 columns on wide cards: short fields (number, grade, class) get narrow cells (issue #212). -->
  <div class="mb-1 grid grid-cols-2 items-start gap-x-3 gap-y-2.5 @lg:grid-cols-6 @2xl:grid-cols-12">
    <SuggestField compact id="editTestart" class="{field} @lg:col-span-2 @2xl:col-span-3" label={$t("exam.metadataEditor.testart")} storageKey="exam.testart" bind:value={editTestart} maxlength={100} />
    <Field compact class="{field} @2xl:col-span-1" label={$t("exam.metadataEditor.nr")} forId="editNr">
      {#snippet children({ id })}
        <input {id} type="text" bind:value={editNr} maxlength={10} class={input} />
      {/snippet}
    </Field>
    <SuggestField compact id="editFach" class="{field} @lg:col-span-2 @2xl:col-span-3" label={$t("exam.metadataEditor.fach")} storageKey="exam.fach" bind:value={editFach} maxlength={100} />
    <SuggestField compact id="editGrade" class="{field} @2xl:col-span-1" label={$t("exam.metadataEditor.grade")} storageKey="exam.grade" bind:value={editGrade} maxlength={50} placeholder="10" />
    <div class="{field} flex flex-col gap-1 @lg:col-span-2">
      <SuggestField compact id="editKlasse" label={$t("exam.metadataEditor.klasse")} storageKey="exam.klasse" bind:value={editKlasse} maxlength={50} placeholder="a" />
      <!-- The printed course (\Klasse) as a small line under Class; the pen sets an own value. -->
      <OverridableText
        variant="hint"
        text={courseCustom ? editCourse.trim() : derivedCourse}
        custom={courseCustom}
        maxlength={50}
        label={$t("exam.metadataEditor.course")}
        editLabel={$t("exam.metadataEditor.courseEdit")}
        resetLabel={$t("exam.metadataEditor.courseReset")}
        customLabel={$t("exam.metadataEditor.courseCustom")}
        hint={$t("exam.metadataEditor.courseHint")}
        onChange={(v) => (editCourse = v === derivedCourse ? "" : v)}
        onReset={() => (editCourse = "")}
      />
    </div>
    <SuggestField compact id="editLehrernachname" class="{field} @lg:col-span-2" label={$t("exam.metadataEditor.lehrernachname")} storageKey="exam.lehrernachname" bind:value={editLehrernachname} maxlength={100} />
    <Field compact class="{field} @lg:col-span-2" label={$t("exam.metadataEditor.datum")} forId="editDatumDate">
      {#snippet children({ id })}
        <input {id} type="text" bind:value={editDatumDate} oninput={handleDatumDateOrDauerChange} placeholder="14.08.2026" class={input} />
      {/snippet}
    </Field>
    <SuggestField compact id="editDauer" class="{field} @lg:col-span-2" label={$t("exam.metadataEditor.dauer")} storageKey="exam.dauer" bind:value={editDauer} oninput={handleDatumDateOrDauerChange} placeholder="30 Min" />
    <Field compact class="{field} @lg:col-span-2 @2xl:col-span-3" label={$t("exam.metadataEditor.retentionUntil")} info={$t("exam.metadataEditor.retentionHint")} forId="editRetention">
      {#snippet children({ id })}
        <input {id} type="date" bind:value={editRetentionUntil} class={input} />
      {/snippet}
    </Field>
    <SuggestField
      compact
      id="editTopic"
      label={$t("exam.metadataEditor.topic")}
      info={$t("exam.metadataEditor.topicHint")}
      storageKey="exam.topic"
      extraSuggestions={topicSuggestions}
      bind:value={editTopic}
      maxlength={200}
      placeholder={$t("exam.metadataEditor.topicPlaceholder")}
      class="{field} col-span-2 @2xl:col-span-5"
    />
  </div>
{/snippet}

{#if inline}
  <div class="@container">
    {@render fields()}
    {#if error}<Alert severity="danger" class="mt-3">{error}</Alert>{/if}
    {#if dirty || busy}
      <!-- Appears only once something changed, so the unchanged card stays as short as possible. -->
      <div class="mt-3 flex flex-wrap justify-end gap-2 border-t border-line pt-3">
        <Button size="sm" variant="outlined" severity="secondary" icon={actionIcons.remove} disabled={busy} onClick={onCancel}>{$t("exam.layout.discard")}</Button>
        <Button size="sm" loading={busy} disabled={busy} onClick={handleSave}>{$t("common.save")}</Button>
      </div>
    {/if}
  </div>
{:else}
<Modal
  open={isOpen}
  size="large"
  title={create ? $t("exam.metadataEditor.createHeading") : $t("exam.metadataEditor.heading")}
  {error}
  onClose={onCancel}
>
  <div class="@container">{@render fields()}</div>
{#snippet footer()}
    <Button variant="outlined" severity="secondary" icon={actionIcons.remove} onClick={onCancel}>{$t("common.cancel")}</Button>
    <Button onClick={handleSave} loading={busy} disabled={busy}>
      {create ? $t("exam.metadataEditor.createButton") : $t("common.save")}
    </Button>
  {/snippet}
</Modal>
{/if}
