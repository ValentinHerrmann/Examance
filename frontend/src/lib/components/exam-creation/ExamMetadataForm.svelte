<script lang="ts">
  import { untrack } from "svelte";
  import SuggestInput from "#lib/components/common/SuggestInput.svelte";
  import { formatExamCourse, parseDatumAndDauer, formatDatumAndDauer } from "#lib/utils/examLabel";
  import { t } from "#lib/i18n";
  import { Card, Field, TextInput, Textarea, controlClass } from "#lib/components/ui";

  interface Props {
    title: string;
    testart: string;
    grade?: string;
    klasse?: string;
    nr: string;
    datum: string;
    fach: string;
    topic?: string;
    /** Topics of the selected exercises, offered next to the previously used exam topics. */
    topicSuggestions?: string[];
    lehrernachname: string;
    infoText: string;
  }

  let {
    title = $bindable(),
    testart = $bindable(),
    grade = $bindable(""),
    klasse = $bindable(""),
    nr = $bindable(),
    datum = $bindable(),
    fach = $bindable(),
    topic = $bindable(""),
    topicSuggestions = [],
    lehrernachname = $bindable(),
    infoText = $bindable()
  }: Props = $props();

  let fullCoursePreview = $derived(formatExamCourse(grade, klasse));

  let datumDate = $state("");
  let dauer = $state("");
  let lastSyncedDatum = "";

  function handleDatumDateOrDauerChange() {
    const formatted = formatDatumAndDauer(datumDate, dauer);
    datum = formatted;
    lastSyncedDatum = formatted;
  }

  $effect.pre(() => {
    const d = datum;
    untrack(() => {
      if (d !== lastSyncedDatum) {
        lastSyncedDatum = d;
        const parsed = parseDatumAndDauer(d);
        datumDate = parsed.datumDate;
        dauer = parsed.dauer;
      }
    });
  });
</script>

<Card title={$t("examCreation.metadataForm.heading")} class="mb-6">
  <div class="@container flex flex-col gap-4">

  <Field label={$t("examCreation.metadataForm.titleLabel")} forId="title">
    <TextInput
      id="title"
      bind:value={title} maxlength={500}
      placeholder={$t("examCreation.metadataForm.titlePlaceholder")}
      required
    />
  </Field>

  <div class="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-4">
    <Field label={$t("examCreation.metadataForm.testartLabel")} forId="testart">
      <SuggestInput
        id="testart"
        class={controlClass}
        storageKey="exam.testart"
        bind:value={testart} maxlength={100}
        placeholder={$t("examCreation.metadataForm.testartPlaceholder")}
        required
      />
    </Field>

    <Field label={$t("examCreation.metadataForm.gradeLabel")} forId="grade">
      <SuggestInput
        id="grade"
        class={controlClass}
        storageKey="exam.grade"
        bind:value={grade} maxlength={50}
        placeholder={$t("examCreation.metadataForm.gradePlaceholder")}
        required
      />
    </Field>

    <Field label={$t("examCreation.metadataForm.klasseLabel")} forId="klasse">
      <SuggestInput
        id="klasse"
        class={controlClass}
        storageKey="exam.klasse"
        bind:value={klasse} maxlength={50}
        placeholder={$t("examCreation.metadataForm.klassePlaceholder")}
      />
    </Field>

    <Field label={$t("examCreation.metadataForm.nrLabel")} forId="nr">
      <TextInput id="nr" bind:value={nr} maxlength={10} placeholder={$t("examCreation.metadataForm.nrPlaceholder")} required />
    </Field>
  </div>

  {#if fullCoursePreview}
    <div class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface-sunken px-3 py-2 text-sm text-muted">
      <span>{$t("examCreation.metadataForm.coursePreviewLabel")} <code class="rounded-sm bg-highlight px-1.5 py-0.5 font-mono text-accent">\Klasse&#123;{fullCoursePreview}&#125;</code>:</span>
      <span class="rounded-md bg-highlight px-2 py-0.5 font-semibold text-accent">{fullCoursePreview}</span>
    </div>
  {/if}

  <div class="grid grid-cols-1 gap-4 @xl:grid-cols-2 @4xl:grid-cols-4">
    <Field label={$t("examCreation.metadataForm.datumLabel")} forId="datumDate">
      <input
        id="datumDate"
        type="text"
        class={controlClass}
        bind:value={datumDate}
        oninput={handleDatumDateOrDauerChange}
        placeholder={$t("examCreation.metadataForm.datumPlaceholder")}
        required
      />
    </Field>

    <Field label={$t("examCreation.metadataForm.dauerLabel")} forId="dauer">
      <SuggestInput
        id="dauer"
        class={controlClass}
        storageKey="exam.dauer"
        bind:value={dauer}
        oninput={handleDatumDateOrDauerChange}
        placeholder={$t("examCreation.metadataForm.dauerPlaceholder")}
      />
    </Field>

    <Field label={$t("examCreation.metadataForm.fachLabel")} forId="fach">
      <SuggestInput
        id="fach"
        class={controlClass}
        storageKey="exam.fach"
        bind:value={fach} maxlength={100}
        placeholder={$t("examCreation.metadataForm.fachPlaceholder")}
        required
      />
    </Field>

    <Field label={$t("examCreation.metadataForm.lehrerLabel")} forId="lehrer">
      <SuggestInput
        id="lehrer"
        class={controlClass}
        storageKey="exam.lehrernachname"
        bind:value={lehrernachname} maxlength={100}
        placeholder={$t("examCreation.metadataForm.lehrerPlaceholder")}
        required
      />
    </Field>
  </div>

  <Field label={$t("examCreation.metadataForm.topicLabel")} forId="topic" hint={$t("examCreation.metadataForm.topicHint")}>
    <SuggestInput
      id="topic"
      class={controlClass}
      storageKey="exam.topic"
      extraSuggestions={topicSuggestions}
      bind:value={topic}
      maxlength={200}
      placeholder={$t("examCreation.metadataForm.topicPlaceholder")}
    />
  </Field>

  <Field label={$t("examCreation.metadataForm.infoLabel")} forId="info">
    <Textarea id="info" rows={2} bind:value={infoText} />
  </Field>
  </div>
</Card>
