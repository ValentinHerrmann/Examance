<script lang="ts">
  import { untrack } from "svelte";
  import { get } from "svelte/store";
  import { api } from "#lib/api/client";
  import { saveExamEncrypted } from "#lib/db/dbEncryption";
  import type { ExamRecord, ExerciseRecord } from "#lib/db/schema";
  import { translate } from "#lib/i18n";
  import { isAuthenticated, sessionStore } from "#lib/stores/session";
  import { exerciseTopicSuggestions } from "#lib/utils/examLabel";
  import ExamMetadataEditor from "#lib/components/exam/ExamMetadataEditor.svelte";

  /** The exam's details (title, class, date, teacher, topic, retention), edited in place on the Overview (issue #212). Print layout is edited on the Exam page, the grading key on Statistics. */
  interface Props {
    exam: ExamRecord;
    /** The exam's exercises: topic suggestions. */
    exercises: ExerciseRecord[];
    /** The saved exam; the page shows it and its success notice. */
    onSaved: (exam: ExamRecord) => void;
    /** Unsaved edits, for the page's leave guard. */
    dirty?: boolean;
  }

  let { exam, exercises, onSaved, dirty = $bindable(false) }: Props = $props();

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

  const fromExam = (e: ExamRecord): Fields => ({
    title: e.title || "",
    testart: e.testart || "Kurzarbeit",
    grade: e.grade || "",
    klasse: e.klasse || "",
    datum: e.datum || "",
    nr: e.nr || "1",
    fach: e.fach || "Informatik",
    topic: e.topic || "",
    lehrernachname: e.lehrernachname || "",
    retentionUntil: e.retentionUntil || "",
  });

  let edit: Fields = $state(untrack(() => fromExam(exam)));
  let initial: Fields = $state(untrack(() => fromExam(exam)));
  let busy = $state(false);
  let error = $state("");

  let isDirty = $derived((Object.keys(edit) as (keyof Fields)[]).some((k) => edit[k] !== initial[k]));

  function reset() {
    edit = fromExam(exam);
    initial = { ...edit };
    error = "";
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
      initial = { ...edit, topic };
      edit = { ...initial };
      onSaved(updated);
    } catch (err: any) {
      error = translate("exam.page.metadata.saveFailed", { message: err.message });
    } finally {
      busy = false;
    }
  }

  let loadedFor = "";
  $effect.pre(() => {
    const id = exam.id;
    if (loadedFor !== id) {
      loadedFor = id;
      untrack(reset);
    }
  });

  $effect.pre(() => {
    const d = isDirty;
    untrack(() => (dirty = d));
  });
</script>

<ExamMetadataEditor
  inline
  dirty={isDirty}
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
  onCancel={reset}
/>
