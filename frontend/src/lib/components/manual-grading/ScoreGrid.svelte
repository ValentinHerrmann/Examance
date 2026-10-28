<script lang="ts">
  import { untrack } from "svelte";
  import { faArrowLeft, faArrowRight, faCheck, faUsers } from "@fortawesome/free-solid-svg-icons";
  import { Alert, Badge, Button, CrossLink, EmptyState, LinkButton, TableScroller, controlClass, controlSmClass } from "#lib/components/ui";
  import { calculateGradeDetail } from "#lib/analytics/gradingKey";
  import { saveSubmissionScores } from "#lib/grading/scoreService";
  import { buildSubmissionMap } from "#lib/utils/studentLookup";
  import type { ExamRecord, ExerciseRecord, StudentRecord, SubmissionRecord } from "#lib/db/schema";
  import { t } from "#lib/i18n";
  import { gradeHref } from "#lib/utils/links";
  import ExerciseEditorModal from "#lib/components/ExerciseEditorModal.svelte";
  import ScoreInputCell from "./ScoreInputCell.svelte";

  interface Props {
    /** 'students': one student at a time, rows are exercises. 'exercises': one exercise at a time, rows are students. */
    orientation: "students" | "exercises";
    exam?: ExamRecord | null;
    examId: string;
    exercises?: ExerciseRecord[];
    students?: StudentRecord[];
    submissions?: SubmissionRecord[];
    scoresMap?: Map<string, Record<string, number | null>>;
    onScoresChanged?: () => void;
    onOpenRoster?: () => void;
  }

  let {
    orientation,
    exam = null,
    examId,
    exercises = [],
    students = [],
    submissions = [],
    scoresMap = new Map(),
    onScoresChanged = () => {},
    onOpenRoster = () => {},
  }: Props = $props();

  let editEx: ExerciseRecord | null = $state.raw(null);
  let currentStudentIndex = $state(0);
  let activeExerciseId: string = $state(untrack(() => exercises[0]?.id || ""));

  let currentStudent = $derived(students[currentStudentIndex]);
  let activeExercise = $derived(exercises.find((e) => e.id === activeExerciseId));
  // Raw: holds the parent's submission objects, which the save mutates (total) and persists.
  let submissionMap = $state.raw(new Map<string, SubmissionRecord>());
  // Only the newest build may write, so a slower stale build cannot overwrite a newer map.
  let submissionMapSeq = 0;
  let currentSub = $derived(currentStudent ? submissionMap.get(currentStudent.pseudonymId) : null);

  // Editable buffer (row index -> input string), bound by the inputs.
  let rawInputs: Record<number, string> = $state({});
  // What the last rebuild put in, and for which student/exercise: a refresh keeps fields edited since then.
  let loadedRaw: Record<number, string> = {};
  let loadedRawFor = "";
  let saveError = $state("");

  const scoreText = (v: number | null | undefined) => (v !== null && v !== undefined ? String(v) : "");

  /** Lenient like the inputs always were ("5,5" and "5abc" read as numbers); null for blank or non-numeric. */
  function parseScore(raw: string | undefined): number | null {
    const str = (raw ?? "").trim().replace(",", ".");
    if (str === "") return null;
    const num = parseFloat(str);
    return isNaN(num) ? null : num;
  }

  // What the inputs show after a rebuild, and the scope (student or exercise) it belongs to.
  let source = $derived.by(() => {
    if (orientation === "students") {
      const sub = currentSub;
      const subScores = sub ? scoresMap.get(sub.id) : undefined;
      return { scope: sub ? `s:${sub.id}` : "", texts: sub ? exercises.map((ex) => scoreText(subScores?.[ex.id])) : [] };
    }
    const exId = activeExerciseId;
    const texts = exId
      ? students.map((st) => {
          const sub = submissionMap.get(st.pseudonymId);
          return sub ? scoreText(scoresMap.get(sub.id)?.[exId]) : "";
        })
      : [];
    return { scope: exId ? `e:${exId}` : "", texts };
  });

  // Which empty state replaces the grid; the order follows what the orientation needs first.
  let emptyKind = $derived.by(() => {
    const noStudents = students.length === 0;
    const noExercises = exercises.length === 0;
    if (orientation === "students") return noStudents ? "students" : noExercises ? "exercises" : null;
    return noExercises ? "exercises" : noStudents ? "students" : null;
  });

  // Students orientation: live total and grade of the typed values.
  let totalMaxPoints = $derived(exercises.reduce((sum, ex) => sum + (ex.maxPoints || 0), 0));
  let parsedScores = $derived(exercises.map((_, idx) => parseScore(rawInputs[idx])));
  let isFullyGraded = $derived(exercises.length > 0 && parsedScores.every((s) => s !== null));
  let sumGradedScores = $derived(
    Math.round(parsedScores.reduce((sum: number, s: number | null) => sum + (s ?? 0), 0) * 100) / 100,
  );
  let gradeDetail = $derived(
    isFullyGraded ? calculateGradeDetail(sumGradedScores, totalMaxPoints, exam?.gradingKey) : null,
  );

  // Exercises orientation: statistics of the active exercise.
  let activeScores = $derived(
    orientation === "exercises"
      ? students
          .map((st) => {
            const sub = submissionMap.get(st.pseudonymId);
            return sub ? scoresMap.get(sub.id)?.[activeExerciseId] : null;
          })
          .filter((v): v is number => v !== null && v !== undefined)
      : [],
  );
  let gradedCount = $derived(activeScores.length);
  let avgScore = $derived(
    gradedCount > 0 ? Math.round((activeScores.reduce((a, b) => a + b, 0) / gradedCount) * 100) / 100 : 0,
  );

  /** Writes `values` (exercise id -> score; a missing id stays as stored) and mirrors the result into `scoresMap`. */
  async function persist(sub: SubmissionRecord, values: Map<string, number | null>) {
    const effective = await saveSubmissionScores(examId, sub, exercises.map((ex) => ex.id), values);
    let subScores = scoresMap.get(sub.id);
    if (!subScores) {
      subScores = {};
      scoresMap.set(sub.id, subScores);
    }
    for (const [exerciseId, score] of effective) subScores[exerciseId] = score;
    onScoresChanged();
  }

  async function saveStudent() {
    const sub = currentSub;
    if (!sub) return;
    // Read before any await: a student switch meanwhile refills the inputs with the next student's scores.
    const values = new Map<string, number | null>();
    exercises.forEach((ex, idx) => {
      const val = parsedScores[idx];
      // Out of range is not written; the field stays marked invalid.
      if (val === null || (val >= 0 && val <= ex.maxPoints)) values.set(ex.id, val);
    });
    await persist(sub, values);
  }

  async function saveCell(index: number) {
    const ex = activeExercise;
    const st = students[index];
    const sub = st ? submissionMap.get(st.pseudonymId) : undefined;
    if (!ex || !sub) return;
    const val = parseScore(rawInputs[index]);
    if (val !== null && (val < 0 || val > ex.maxPoints)) return; // stays marked invalid
    await persist(sub, new Map([[ex.id, val]]));
  }

  /** False when nothing was written; the error is shown inline and the selection stays. */
  async function save(row = 0): Promise<boolean> {
    try {
      if (orientation === "students") await saveStudent();
      else await saveCell(row);
      saveError = "";
      return true;
    } catch (err) {
      saveError = err instanceof Error ? err.message : String(err);
      return false;
    }
  }

  // Target computed before the save's await (issue #85 rule): the save triggers a data refresh.
  async function goStudent(delta: -1 | 1) {
    const target = Math.min(students.length - 1, Math.max(0, currentStudentIndex + delta));
    if (!(await save())) return;
    currentStudentIndex = target;
  }

  $effect.pre(() => {
    const exs = exercises;
    const currentId = activeExerciseId;
    if (exs.length > 0 && (!currentId || !exs.some((e) => e.id === currentId))) {
      untrack(() => {
        activeExerciseId = exs[0].id;
      });
    }
  });

  $effect.pre(() => {
    const subs = submissions;
    const sts = students;
    const seq = ++submissionMapSeq;
    untrack(() =>
      buildSubmissionMap(subs, sts).then((m) => {
        if (seq === submissionMapSeq) submissionMap = m;
      }),
    );
  });

  $effect.pre(() => {
    const src = source;
    untrack(() => {
      const newRaw: Record<number, string> = {};
      src.texts.forEach((text, idx) => (newRaw[idx] = text));
      const merged = { ...newRaw };
      if (src.scope && src.scope === loadedRawFor) {
        for (const k of Object.keys(merged)) {
          const idx = Number(k);
          if (rawInputs[idx] !== undefined && rawInputs[idx] !== loadedRaw[idx]) merged[idx] = rawInputs[idx];
        }
      }
      loadedRaw = newRaw;
      loadedRawFor = src.scope;
      rawInputs = merged;
    });
  });
</script>

<div class="flex min-w-0 flex-col gap-4">
  {#if emptyKind === "students"}
    <EmptyState title={$t("grading.manual.grid.noStudents")}>
      <Button icon={faUsers} onClick={onOpenRoster}>{$t("grading.manual.grid.openRoster")}</Button>
    </EmptyState>
  {:else if emptyKind === "exercises"}
    <EmptyState title={$t("grading.manual.grid.noExercises")}>
      <Button href="/exam/{examId}" variant="text">{$t("grading.manual.grid.goToSetup")}</Button>
    </EmptyState>
  {:else}
    <div class="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-surface-sunken p-3">
      {#if orientation === "students"}
        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <label for="student-select" class="text-sm text-content">{$t("grading.manual.studentFirst.selectStudent")}</label>
          <!-- No save on change: the binding has already switched the student, so it wrote the previous
               student's inputs onto the new one. The inputs save on blur before the select gets focus. -->
          <select
            id="student-select"
            class="{controlClass} {controlSmClass} w-full sm:w-56"
            bind:value={currentStudentIndex}
          >
            {#each students as st, idx}
              <option value={idx}>
                {idx + 1}. {st.studentName || $t("grading.manual.grid.unnamed")} {st.studentNumber ? `(${st.studentNumber})` : ""}
              </option>
            {/each}
          </select>
        </div>

        <div class="flex min-w-0 flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outlined"
            severity="secondary"
            icon={faArrowLeft}
            disabled={currentStudentIndex === 0}
            onClick={() => goStudent(-1)}
          >
            {$t("grading.manual.studentFirst.prevStudent")}
          </Button>
          <span class="text-sm text-muted">
            {currentStudentIndex + 1} / {students.length}
          </span>
          <Button
            size="sm"
            variant="outlined"
            severity="secondary"
            iconRight={faArrowRight}
            disabled={currentStudentIndex >= students.length - 1}
            onClick={() => goStudent(1)}
          >
            {$t("grading.manual.studentFirst.nextStudent")}
          </Button>
        </div>
      {:else}
        <div class="flex min-w-0 flex-wrap gap-2">
          {#each exercises as ex, idx}
            <Button
              size="sm"
              variant="outlined"
              severity="secondary"
              pressed={ex.id === activeExerciseId}
              onClick={() => (activeExerciseId = ex.id)}
            >
              {ex.name || $t("grading.manual.exerciseFirst.exerciseFallback", { index: idx + 1 })} {$t("grading.manual.exerciseFirst.pointsSuffix", { points: ex.maxPoints })}
            </Button>
          {/each}
        </div>

        {#if activeExercise}
          <div class="flex min-w-0 items-center gap-3">
            <h3 class="m-0 min-w-0 text-lg font-semibold text-content"><LinkButton onClick={() => (editEx = activeExercise)} class="text-content!">{activeExercise.name}</LinkButton></h3>
            <Badge>{$t("grading.manual.exerciseFirst.maxPointsLabel")} <strong class="ml-1">{activeExercise.maxPoints}</strong></Badge>
          </div>
        {/if}
      {/if}
    </div>

    {#if saveError}
      <Alert severity="danger" onDismiss={() => (saveError = "")}>
        {$t("grading.manual.saveFailed", { message: saveError })}
      </Alert>
    {/if}

    {#if orientation === "students"}
      {#if currentStudent}
        <div class="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-surface-raised px-5 py-4">
          <div class="min-w-0">
            <h3 class="m-0 mb-1 text-lg font-semibold text-content">
              {#if currentSub}
                <CrossLink href={gradeHref(examId, { submissionId: currentSub.id })} class="text-content">{currentStudent.studentName || $t("grading.manual.studentFirst.unnamedStudent")}</CrossLink>
              {:else}
                {currentStudent.studentName || $t("grading.manual.studentFirst.unnamedStudent")}
              {/if}
            </h3>
            <p class="m-0 text-sm text-muted">{$t("grading.manual.studentFirst.studentInfo", { number: currentStudent.studentNumber || "-", code: currentStudent.fallbackCode || currentStudent.pseudonymId.slice(0, 8) })}</p>
          </div>

          <div class="flex flex-col items-end gap-0.5">
            {#if isFullyGraded && gradeDetail}
              <div class="text-2xl font-bold text-accent">{gradeDetail.grade}</div>
              <div class="text-sm text-content">{$t("grading.manual.studentFirst.gradeLabelPoints", { label: gradeDetail.label, score: sumGradedScores, max: totalMaxPoints })}</div>
            {:else if parsedScores.some((s) => s !== null)}
              <div class="text-xl font-bold text-warning-fg">
                {$t("grading.manual.studentFirst.pointsFraction", { score: sumGradedScores, max: totalMaxPoints })}
              </div>
              <div class="text-sm text-content">{$t("grading.manual.studentFirst.incompleteGrading")}</div>
            {:else}
              <div class="text-lg font-bold text-muted">
                {$t("grading.manual.grid.ungraded")}
              </div>
              <div class="text-sm text-content">{$t("grading.manual.studentFirst.pointsFraction", { score: 0, max: totalMaxPoints })}</div>
            {/if}
          </div>
        </div>

        <TableScroller>
          <table class="data-table data-table-compact data-table-sticky">
            <thead>
              <tr>
                <th>{$t("grading.manual.grid.colNum")}</th>
                <th>{$t("grading.manual.studentFirst.colName")}</th>
                <th>{$t("grading.manual.studentFirst.colMax")}</th>
                <th>{$t("grading.manual.studentFirst.colScore")}</th>
              </tr>
            </thead>
            <tbody>
              {#each exercises as ex, idx (ex.id)}
                <tr>
                  <td>{idx + 1}</td>
                  <td><strong><LinkButton onClick={() => (editEx = ex)} class="text-content!">{ex.name}</LinkButton></strong></td>
                  <td>{$t("grading.manual.studentFirst.pointsSuffix", { points: ex.maxPoints })}</td>
                  <ScoreInputCell bind:value={rawInputs[idx]} max={ex.maxPoints} onCommit={() => save()} />
                </tr>
              {/each}
            </tbody>
          </table>
        </TableScroller>

        <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-sunken p-3">
          <Button
            variant="outlined"
            severity="secondary"
            icon={faArrowLeft}
            disabled={currentStudentIndex === 0}
            onClick={() => goStudent(-1)}
          >
            {$t("grading.manual.studentFirst.savePrev")}
          </Button>
          <Button severity="success" icon={faCheck} onClick={() => save()}>
            {$t("grading.manual.studentFirst.saveScores")}
          </Button>
          <Button
            variant="outlined"
            severity="secondary"
            iconRight={faArrowRight}
            disabled={currentStudentIndex >= students.length - 1}
            onClick={() => goStudent(1)}
          >
            {$t("grading.manual.studentFirst.saveNext")}
          </Button>
        </div>
      {/if}
    {:else}
      <TableScroller>
        <table class="data-table data-table-compact data-table-sticky data-table-hover">
          <thead>
            <tr>
              <th>{$t("grading.manual.grid.colNum")}</th>
              <th>{$t("grading.manual.exerciseFirst.colName")}</th>
              <th>{$t("grading.manual.exerciseFirst.colId")}</th>
              <th>{$t("grading.manual.exerciseFirst.colScore", { max: activeExercise?.maxPoints ?? 0 })}</th>
              <th>{$t("grading.manual.exerciseFirst.colStatus")}</th>
            </tr>
          </thead>
          <tbody>
            {#each students as st, i (st.pseudonymId)}
              {@const sub = submissionMap.get(st.pseudonymId)}
              <tr>
                <td>{i + 1}</td>
                <td>
                  {#if sub}
                    <strong><CrossLink href={gradeHref(examId, { submissionId: sub.id })} class="text-content">{st.studentName || $t("grading.manual.grid.unnamed")}</CrossLink></strong>
                  {:else}
                    <strong>{st.studentName || $t("grading.manual.grid.unnamed")}</strong>
                  {/if}
                </td>
                <td>{st.studentNumber || "-"}</td>
                <ScoreInputCell bind:value={rawInputs[i]} max={activeExercise?.maxPoints ?? 0} onCommit={() => save(i)} />
                <td>
                  {#if sub?.totalScore !== undefined}
                    <span class="text-sm font-medium text-success-fg">
                      {$t("grading.manual.exerciseFirst.totalScore", { score: sub.totalScore })}
                    </span>
                  {:else if activeScores.length > 0}
                    <span class="text-sm text-content">{$t("grading.manual.exerciseFirst.inProgress")}</span>
                  {:else}
                    <span class="text-sm text-muted">{$t("grading.manual.grid.ungraded")}</span>
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </TableScroller>

      <div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line bg-surface-sunken px-4 py-3 text-sm text-muted">
        <div>
          {$t("grading.manual.exerciseFirst.graded", { graded: gradedCount, total: students.length })}
        </div>
        <div>
          {$t("grading.manual.exerciseFirst.average", { name: activeExercise?.name ?? "", avg: avgScore, max: activeExercise?.maxPoints ?? 0 })}
        </div>
      </div>
    {/if}
  {/if}
</div>

{#if editEx}
  <ExerciseEditorModal isOpen editingExercise={editEx} onClose={() => (editEx = null)} onSave={() => onScoresChanged()} />
{/if}
