<script lang="ts">
  import { get } from "svelte/store";
  import { api } from "#lib/api/client";
  import { getPresetCutoffs } from "#lib/analytics/gradingKey";
  import { saveExamEncrypted } from "#lib/db/dbEncryption";
  import type { ExamRecord, ExerciseRecord, GradingKeyConfig } from "#lib/db/schema";
  import { t, translate } from "#lib/i18n";
  import { setExamLogo, type ExamLogoChange } from "#lib/latex/logo";
  import { entriesError, type LatexPackageEntry } from "#lib/latex/packages";
  import { isAuthenticated, sessionStore } from "#lib/stores/session";
  import { exerciseTopicSuggestions } from "#lib/utils/examLabel";
  import { ConfirmDialog } from "#lib/components/ui";
  import ExamMetadataEditor from "#lib/components/exam/ExamMetadataEditor.svelte";

  interface Props {
    exam: ExamRecord;
    /** The exam's exercises: topic suggestions and the package result. */
    exercises: ExerciseRecord[];
    /** The updated exam, handed over before it is persisted so the page shows it right away. */
    onExamChange: (exam: ExamRecord) => void;
    /** The printed exam changed: the page re-checks the OMR template and refreshes a shown preview. */
    onLayoutChange: () => void;
  }

  let { exam, exercises, onExamChange, onLayoutChange }: Props = $props();

  let isEditingMetadata = $state(false);
  let editTitle = $state("");
  let editTestart = $state("");
  let editGrade = $state("");
  let editKlasse = $state("");
  let editDatum = $state("");
  let editNr = $state("");
  let editFach = $state("");
  let editTopic = $state("");
  let editLehrernachname = $state("");
  let editInfoText = $state("");
  let editNameLine = $state(false);
  let editMcCorrectionHint = $state(false);
  let editLogoChange: ExamLogoChange | null = $state.raw(null);
  let editLatexPackages: LatexPackageEntry[] | null = $state.raw(null);
  let initialLatexPackages = $state("null");
  let editRetentionUntil = $state("");
  let editGradingKey: GradingKeyConfig = $state({
    preset: "linear_50",
    cutoffs: getPresetCutoffs("linear_50"),
  });

  let initialMetadata = $state({
    title: "",
    testart: "",
    grade: "",
    klasse: "",
    datum: "",
    nr: "",
    fach: "",
    topic: "",
    lehrernachname: "",
    infoText: "",
    nameLine: false,
    mcCorrectionHint: false,
    retentionUntil: "",
  });
  let showMetadataConfirm = $state(false);

  let isMetadataDirty = $derived(
    isEditingMetadata &&
      (editTitle !== initialMetadata.title ||
        editTestart !== initialMetadata.testart ||
        editGrade !== initialMetadata.grade ||
        editKlasse !== initialMetadata.klasse ||
        editDatum !== initialMetadata.datum ||
        editNr !== initialMetadata.nr ||
        editFach !== initialMetadata.fach ||
        editTopic !== initialMetadata.topic ||
        editLehrernachname !== initialMetadata.lehrernachname ||
        editInfoText !== initialMetadata.infoText ||
        editNameLine !== initialMetadata.nameLine ||
        editMcCorrectionHint !== initialMetadata.mcCorrectionHint ||
        editLogoChange !== null ||
        JSON.stringify(editLatexPackages) !== initialLatexPackages ||
        editRetentionUntil !== initialMetadata.retentionUntil),
  );

  /** Fills the edit buffers from the exam and shows the editor. */
  export function open() {
    editTitle = exam.title || "";
    editTestart = exam.testart || "Kurzarbeit";
    editGrade = exam.grade || "";
    editKlasse = exam.klasse || "";
    editDatum = exam.datum || "";
    editNr = exam.nr || "1";
    editFach = exam.fach || "Informatik";
    editTopic = exam.topic || "";
    editLehrernachname = exam.lehrernachname || "";
    editInfoText = exam.infoText || "";
    editNameLine = exam.nameLine === true;
    editMcCorrectionHint = exam.mcCorrectionHint === true;
    editRetentionUntil = exam.retentionUntil || "";
    editGradingKey = exam.gradingKey || {
      preset: "linear_50",
      cutoffs: getPresetCutoffs("linear_50"),
    };

    initialMetadata = {
      title: editTitle,
      testart: editTestart,
      grade: editGrade,
      klasse: editKlasse,
      datum: editDatum,
      nr: editNr,
      fach: editFach,
      topic: editTopic,
      lehrernachname: editLehrernachname,
      infoText: editInfoText,
      nameLine: editNameLine,
      mcCorrectionHint: editMcCorrectionHint,
      retentionUntil: editRetentionUntil,
    };
    editLogoChange = null;
    editLatexPackages = exam.latexPackages ?? null;
    initialLatexPackages = JSON.stringify(editLatexPackages);
    showMetadataConfirm = false;
    isEditingMetadata = true;
  }

  function requestCancelMetadata() {
    if (isMetadataDirty) {
      showMetadataConfirm = true;
    } else {
      forceCancelMetadata();
    }
  }

  function forceCancelMetadata() {
    showMetadataConfirm = false;
    isEditingMetadata = false;
  }

  async function handleSaveMetadata() {
    // editGradingKey is a deep edit buffer (GradingKeyEditor mutates it); persist a plain copy.
    const gradingKey = $state.snapshot(editGradingKey);
    // Sent even when empty: "" is how the server learns the topic was cleared.
    const topic = editTopic.trim();
    if (editLatexPackages && entriesError(editLatexPackages)) {
      alert(translate("latexPackages.exam.invalid"));
      return;
    }
    // An empty override prints the same as none; the server stores both as "follows the account".
    const latexPackages = editLatexPackages?.length ? editLatexPackages : null;
    try {
      if ($isAuthenticated) {
        await api.patch(`/exams/${exam.id}`, {
          title: editTitle,
          testart: editTestart,
          grade: editGrade,
          klasse: editKlasse,
          datum: editDatum,
          nr: editNr,
          fach: editFach,
          topic,
          lehrernachname: editLehrernachname,
          info_text: editInfoText,
          name_line: editNameLine,
          mc_correction_hint: editMcCorrectionHint,
          grading_key: gradingKey,
          latex_packages: latexPackages,
          retention_until: editRetentionUntil,
        });
      }

      const updated: ExamRecord = {
        ...exam,
        title: editTitle,
        testart: editTestart,
        grade: editGrade,
        klasse: editKlasse,
        datum: editDatum,
        nr: editNr,
        fach: editFach,
        topic,
        lehrernachname: editLehrernachname,
        infoText: editInfoText,
        nameLine: editNameLine,
        mcCorrectionHint: editMcCorrectionHint,
        retentionUntil: editRetentionUntil,
        gradingKey,
        latexPackages,
      };
      onExamChange(updated);
      const key = get(sessionStore).sessionKey;
      await saveExamEncrypted(updated, key);

      if (editLogoChange) {
        try {
          await setExamLogo(updated.id, editLogoChange.mode, editLogoChange.bytes);
        } catch (err: any) {
          alert(translate("logo.exam.saveFailed", { message: err.message }));
          return;
        }
      }

      forceCancelMetadata();
      onLayoutChange();
      alert(translate("exam.page.metadata.saveSuccess"));
    } catch (err: any) {
      alert(translate("exam.page.metadata.saveFailed", { message: err.message }));
    }
  }
</script>

<ExamMetadataEditor
  isOpen={isEditingMetadata}
  bind:editTitle
  bind:editTestart
  bind:editGrade
  bind:editKlasse
  bind:editDatum
  bind:editNr
  bind:editFach
  bind:editTopic
  topicSuggestions={exerciseTopicSuggestions(exercises)}
  bind:editLehrernachname
  bind:editInfoText
  bind:editNameLine
  bind:editMcCorrectionHint
  bind:editRetentionUntil
  bind:editGradingKey
  examId={exam.id}
  bind:logoChange={editLogoChange}
  bind:editLatexPackages
  packageSources={exercises.map((ex) => ({ label: ex.name || "", latex: ex.latexBody || "" }))}
  onSave={handleSaveMetadata}
  onCancel={requestCancelMetadata}
/>

<ConfirmDialog
  open={showMetadataConfirm}
  title={$t("exam.page.metadata.discardTitle")}
  message={$t("exam.page.metadata.discardMessage")}
  confirmText={$t("exam.page.metadata.discardConfirm")}
  cancelText={$t("exam.page.metadata.discardKeepEditing")}
  severity="danger"
  role="dialog"
  onConfirm={forceCancelMetadata}
  onCancel={() => (showMetadataConfirm = false)}
/>
