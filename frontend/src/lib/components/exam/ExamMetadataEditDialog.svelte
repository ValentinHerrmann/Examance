<script lang="ts">
  import { get } from "svelte/store";
  import { api } from "#lib/api/client";
  import { saveExamEncrypted } from "#lib/db/dbEncryption";
  import type { ExamRecord, ExerciseRecord } from "#lib/db/schema";
  import { t, translate } from "#lib/i18n";
  import { isAuthenticated, sessionStore } from "#lib/stores/session";
  import { exerciseTopicSuggestions } from "#lib/utils/examLabel";
  import { ConfirmDialog } from "#lib/components/ui";
  import ExamMetadataEditor from "#lib/components/exam/ExamMetadataEditor.svelte";

  /** The exam's details (title, class, date, teacher, topic, retention). Print layout is edited on the Exam page, the grading key on Statistics (issue #212). */
  interface Props {
    exam: ExamRecord;
    /** The exam's exercises: topic suggestions. */
    exercises: ExerciseRecord[];
    /** The saved exam; the page shows it and its success notice. */
    onSaved: (exam: ExamRecord) => void;
  }

  let { exam, exercises, onSaved }: Props = $props();

  type Fields = {
    title: string;
    testart: string;
    grade: string;
    klasse: string;
    datum: string;
    nr: string;
    fach: string;
    topic: string;
    lehrernachname: string;
    retentionUntil: string;
  };
  const blank: Fields = { title: "", testart: "", grade: "", klasse: "", datum: "", nr: "", fach: "", topic: "", lehrernachname: "", retentionUntil: "" };

  let isOpen = $state(false);
  let edit: Fields = $state({ ...blank });
  let initial: Fields = $state({ ...blank });
  let busy = $state(false);
  let error = $state("");
  let showDiscardConfirm = $state(false);

  let isDirty = $derived(isOpen && (Object.keys(edit) as (keyof Fields)[]).some((k) => edit[k] !== initial[k]));

  /** Fills the edit buffers from the exam and shows the editor. */
  export function open() {
    edit = {
      title: exam.title || "",
      testart: exam.testart || "Kurzarbeit",
      grade: exam.grade || "",
      klasse: exam.klasse || "",
      datum: exam.datum || "",
      nr: exam.nr || "1",
      fach: exam.fach || "Informatik",
      topic: exam.topic || "",
      lehrernachname: exam.lehrernachname || "",
      retentionUntil: exam.retentionUntil || "",
    };
    initial = { ...edit };
    error = "";
    showDiscardConfirm = false;
    isOpen = true;
  }

  function requestCancel() {
    if (isDirty) showDiscardConfirm = true;
    else close();
  }

  function close() {
    showDiscardConfirm = false;
    isOpen = false;
  }

  async function save() {
    // Sent even when empty: "" is how the server learns the topic was cleared.
    const topic = edit.topic.trim();
    busy = true;
    error = "";
    try {
      if (get(isAuthenticated)) {
        await api.patch(`/exams/${exam.id}`, {
          title: edit.title,
          testart: edit.testart,
          grade: edit.grade,
          klasse: edit.klasse,
          datum: edit.datum,
          nr: edit.nr,
          fach: edit.fach,
          topic,
          lehrernachname: edit.lehrernachname,
          retention_until: edit.retentionUntil,
        });
      }
      const updated: ExamRecord = { ...exam, ...edit, topic };
      await saveExamEncrypted(updated, get(sessionStore).sessionKey);
      onSaved(updated);
      close();
    } catch (err: any) {
      error = translate("exam.page.metadata.saveFailed", { message: err.message });
    } finally {
      busy = false;
    }
  }
</script>

<ExamMetadataEditor
  {isOpen}
  {busy}
  {error}
  bind:editTitle={edit.title}
  bind:editTestart={edit.testart}
  bind:editGrade={edit.grade}
  bind:editKlasse={edit.klasse}
  bind:editDatum={edit.datum}
  bind:editNr={edit.nr}
  bind:editFach={edit.fach}
  bind:editTopic={edit.topic}
  topicSuggestions={exerciseTopicSuggestions(exercises)}
  bind:editLehrernachname={edit.lehrernachname}
  bind:editRetentionUntil={edit.retentionUntil}
  onSave={save}
  onCancel={requestCancel}
/>

<ConfirmDialog
  open={showDiscardConfirm}
  title={$t("exam.page.metadata.discardTitle")}
  message={$t("exam.page.metadata.discardMessage")}
  confirmText={$t("exam.page.metadata.discardConfirm")}
  cancelText={$t("exam.page.metadata.discardKeepEditing")}
  severity="danger"
  role="dialog"
  onConfirm={close}
  onCancel={() => (showDiscardConfirm = false)}
/>
