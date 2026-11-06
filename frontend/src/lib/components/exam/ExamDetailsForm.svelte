<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { createAutosave, IDLE_SAVE, type AutosaveStatus } from "#lib/utils/autosave";
  import { get } from "svelte/store";
  import { api } from "#lib/api/client";
  import { saveExamEncrypted } from "#lib/db/dbEncryption";
  import type { ExamRecord, ExerciseRecord } from "#lib/db/schema";
  import { translate } from "#lib/i18n";
  import { isAuthenticated, sessionStore } from "#lib/stores/session";
  import { exerciseTopicSuggestions } from "#lib/utils/examLabel";
  import ExamMetadataEditor from "#lib/components/exam/ExamMetadataEditor.svelte";

  /** The exam's details (title, class, date, teacher, topic, retention), edited in place on the Overview (issue #212); every change saves itself (issue #228). Print layout is edited on the Exam page, the grading key on Statistics. */
  interface Props {
    exam: ExamRecord;
    /** The exam's exercises: topic suggestions. */
    exercises: ExerciseRecord[];
    /** The saved exam, for the page to show. */
    onSaved: (exam: ExamRecord) => void;
    /** A change is waiting for or in its save, for the page's leave guard. */
    dirty?: boolean;
    /** Out: the autosave status, for the card header's `SaveStatus`. */
    status?: AutosaveStatus;
  }

  let { exam, exercises, onSaved, dirty = $bindable(false), status = $bindable(IDLE_SAVE) }: Props = $props();

  type Fields = {
    title: string;
    testart: string;
    grade: string;
    klasse: string;
    course: string;
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
    course: e.course || "",
    datum: e.datum || "",
    nr: e.nr || "1",
    fach: e.fach || "Informatik",
    topic: e.topic || "",
    lehrernachname: e.lehrernachname || "",
    retentionUntil: e.retentionUntil || "",
  });

  /** What is sent: trimmed where the server stores trimmed, so trailing spaces are no unsaved change. */
  const sent = (f: Fields): Fields => ({ ...f, topic: f.topic.trim(), course: f.course.trim() });

  let edit: Fields = $state(untrack(() => fromExam(exam)));
  /** The last saved values, in their sent form. */
  let saved: Fields = $state(untrack(() => sent(fromExam(exam))));
  let editor: ReturnType<typeof ExamMetadataEditor> | undefined = $state();

  let editKey = $derived(JSON.stringify(sent(edit)));
  let isDirty = $derived(editKey !== JSON.stringify(saved));

  function reset() {
    edit = fromExam(exam);
    saved = sent(edit);
  }

  async function save() {
    // Taken at the start: edits typed during the request stay unsaved and schedule the next save.
    const values = sent($state.snapshot(edit));
    if (JSON.stringify(values) === JSON.stringify(saved)) return;
    if (get(isAuthenticated)) {
      // Sent even when empty: "" is how the server learns the topic was cleared.
      await api.patch(
        `/exams/${exam.id}`,
        {
          title: values.title,
          testart: values.testart,
          grade: values.grade,
          klasse: values.klasse,
          course: values.course,
          datum: values.datum,
          nr: values.nr,
          fach: values.fach,
          topic: values.topic,
          lehrernachname: values.lehrernachname,
          retention_until: values.retentionUntil,
        },
        { silentError: true },
      );
    }
    const updated: ExamRecord = { ...exam, ...values };
    await saveExamEncrypted(updated, get(sessionStore).sessionKey);
    saved = values;
    editor?.remember();
    onSaved(updated);
  }

  const autosave = createAutosave({ run: save, message: (err: any) => translate("exam.page.metadata.saveFailed", { message: err?.message ?? String(err) }) });

  // Leaving the page still saves what was typed.
  onDestroy(() => autosave.dispose());

  let loadedFor = "";
  $effect.pre(() => {
    const id = exam.id;
    if (loadedFor !== id) {
      loadedFor = id;
      untrack(reset);
    }
  });

  // Every edit schedules a save.
  $effect.pre(() => {
    void editKey;
    const d = isDirty;
    untrack(() => {
      if (d) autosave.schedule();
    });
  });

  $effect.pre(() => {
    const s = $autosave;
    const d = isDirty;
    untrack(() => {
      dirty = d || autosave.busy;
      status = s;
    });
  });
</script>

<ExamMetadataEditor
  bind:this={editor}
  inline
  bind:editTitle={edit.title}
  bind:editTestart={edit.testart}
  bind:editGrade={edit.grade}
  bind:editKlasse={edit.klasse}
  bind:editCourse={edit.course}
  bind:editDatum={edit.datum}
  bind:editNr={edit.nr}
  bind:editFach={edit.fach}
  bind:editTopic={edit.topic}
  topicSuggestions={exerciseTopicSuggestions(exercises)}
  bind:editLehrernachname={edit.lehrernachname}
  bind:editRetentionUntil={edit.retentionUntil}
/>
