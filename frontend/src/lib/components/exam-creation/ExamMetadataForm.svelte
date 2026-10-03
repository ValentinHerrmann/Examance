<script lang="ts">
  import SuggestInput from "$lib/components/common/SuggestInput.svelte";
  import { formatExamCourse, parseDatumAndDauer, formatDatumAndDauer } from "$lib/utils/examLabel";
  import { t } from "$lib/i18n";
  import { Card, Field, TextInput, Textarea, controlClass } from "$lib/components/ui";
  export let title: string;
  export let testart: string;
  export let grade: string = "";
  export let klasse: string = "";
  export let nr: string;
  export let datum: string;
  export let fach: string;
  export let lehrernachname: string;
  export let infoText: string;

  $: fullCoursePreview = formatExamCourse(grade, klasse);

  let datumDate = "";
  let dauer = "";
  let lastSyncedDatum = "";

  $: if (datum !== lastSyncedDatum) {
    lastSyncedDatum = datum;
    const parsed = parseDatumAndDauer(datum);
    datumDate = parsed.datumDate;
    dauer = parsed.dauer;
  }

  function handleDatumDateOrDauerChange() {
    const formatted = formatDatumAndDauer(datumDate, dauer);
    datum = formatted;
    lastSyncedDatum = formatted;
  }
</script>

<Card title={$t("examCreation.metadataForm.heading")} class="mb-6">
  <div class="@container flex flex-col gap-4">

  <Field label={$t("examCreation.metadataForm.titleLabel")} forId="title">
    <TextInput
      id="title"
      bind:value={title}
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
        bind:value={testart}
        placeholder={$t("examCreation.metadataForm.testartPlaceholder")}
        required
      />
    </Field>

    <Field label={$t("examCreation.metadataForm.gradeLabel")} forId="grade">
      <SuggestInput
        id="grade"
        class={controlClass}
        storageKey="exam.grade"
        bind:value={grade}
        placeholder={$t("examCreation.metadataForm.gradePlaceholder")}
        required
      />
    </Field>

    <Field label={$t("examCreation.metadataForm.klasseLabel")} forId="klasse">
      <SuggestInput
        id="klasse"
        class={controlClass}
        storageKey="exam.klasse"
        bind:value={klasse}
        placeholder={$t("examCreation.metadataForm.klassePlaceholder")}
      />
    </Field>

    <Field label={$t("examCreation.metadataForm.nrLabel")} forId="nr">
      <TextInput id="nr" bind:value={nr} placeholder={$t("examCreation.metadataForm.nrPlaceholder")} required />
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
        on:input={handleDatumDateOrDauerChange}
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
        on:input={handleDatumDateOrDauerChange}
        placeholder={$t("examCreation.metadataForm.dauerPlaceholder")}
      />
    </Field>

    <Field label={$t("examCreation.metadataForm.fachLabel")} forId="fach">
      <SuggestInput
        id="fach"
        class={controlClass}
        storageKey="exam.fach"
        bind:value={fach}
        placeholder={$t("examCreation.metadataForm.fachPlaceholder")}
        required
      />
    </Field>

    <Field label={$t("examCreation.metadataForm.lehrerLabel")} forId="lehrer">
      <SuggestInput
        id="lehrer"
        class={controlClass}
        storageKey="exam.lehrernachname"
        bind:value={lehrernachname}
        placeholder={$t("examCreation.metadataForm.lehrerPlaceholder")}
        required
      />
    </Field>
  </div>

  <Field label={$t("examCreation.metadataForm.infoLabel")} forId="info">
    <Textarea id="info" rows={2} bind:value={infoText} />
  </Field>
  </div>
</Card>
