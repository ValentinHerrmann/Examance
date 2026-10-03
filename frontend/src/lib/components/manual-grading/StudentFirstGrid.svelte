<script lang="ts">
  import { faArrowLeft, faArrowRight, faCheck, faUsers } from "@fortawesome/free-solid-svg-icons";
  import { Button, EmptyState, TableScroller, controlClass, controlSmClass } from "$lib/components/ui";
  import { get } from "svelte/store";
  import { sessionStore } from "$lib/stores/session";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import { api } from "$lib/api/client";
  import { db } from "$lib/db/db";
  import { saveSubmissionEncrypted } from "$lib/db/dbEncryption";
  import { scoreRepository } from "$lib/repositories/scoreRepository";
  import { calculateGradeDetail } from "$lib/analytics/gradingKey";
  import { buildSubmissionMap } from "$lib/utils/studentLookup";
  import type {
    ExamRecord,
    ExerciseRecord,
    ExerciseScoreRecord,
    StudentRecord,
    SubmissionRecord,
  } from "$lib/db/schema";
  import { t } from "$lib/i18n";

  export let exam: ExamRecord | null = null;
  export let examId: string;
  export let exercises: ExerciseRecord[] = [];
  export let students: StudentRecord[] = [];
  export let submissions: SubmissionRecord[] = [];
  export let scoresMap: Map<string, Record<string, number | null>> = new Map();
  export let onScoresChanged: () => void = () => {};
  export let onOpenRoster: () => void = () => {};

  let currentStudentIndex = 0;
  let inputElements: (HTMLInputElement | null)[] = [];

  $: currentStudent = students[currentStudentIndex];
  let submissionMap = new Map<string, SubmissionRecord>();
  $: {
    buildSubmissionMap(submissions, students).then((m) => {
      submissionMap = m;
    });
  }
  $: currentSub = (currentStudent && submissionMap) ? submissionMap.get(currentStudent.pseudonymId) : null;

  // Local state for exercise inputs of current student: exerciseIndex -> raw string
  let rawInputs: Record<number, string> = {};

  $: {
    const newRaw: Record<number, string> = {};
    if (currentSub) {
      const subScores = scoresMap.get(currentSub.id);
      exercises.forEach((ex, idx) => {
        const val = subScores?.[ex.id];
        newRaw[idx] = val !== null && val !== undefined ? String(val) : "";
      });
    }
    rawInputs = newRaw;
  }

  $: totalMaxPoints = exercises.reduce((sum, ex) => sum + (ex.maxPoints || 0), 0);

  // Live total & grade calculation
  $: parsedScores = exercises.map((ex, idx) => {
    const str = (rawInputs[idx] ?? "").trim().replace(",", ".");
    if (str === "") return null;
    const num = parseFloat(str);
    return isNaN(num) ? null : num;
  });

  $: isFullyGraded = exercises.length > 0 && parsedScores.every((s) => s !== null);
  $: sumGradedScores = Math.round(
    parsedScores.reduce((sum: number, s: number | null) => sum + (s ?? 0), 0) * 100
  ) / 100;
  $: liveTotalScore = isFullyGraded ? sumGradedScores : undefined;

  $: gradeDetail = isFullyGraded && liveTotalScore !== undefined
    ? calculateGradeDetail(liveTotalScore, totalMaxPoints, exam?.gradingKey)
    : null;

  function handleKeyDown(e: KeyboardEvent, index: number) {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      if (index < exercises.length - 1 && inputElements[index + 1]) {
        inputElements[index + 1]?.focus();
        inputElements[index + 1]?.select();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (index > 0 && inputElements[index - 1]) {
        inputElements[index - 1]?.focus();
        inputElements[index - 1]?.select();
      }
    }
  }

  async function handleSaveCurrentStudent() {
    if (!currentSub) return;
    const key = get(sessionStore).sessionKey;

    let subScores = scoresMap.get(currentSub.id);
    if (!subScores) {
      subScores = {};
      scoresMap.set(currentSub.id, subScores);
    }

    // Collected and written in one call rather than per exercise — the
    // repository reconciles on (submissionId, exerciseId), so no per-row
    // lookup is needed here.
    const toSave: ExerciseScoreRecord[] = [];
    const toClear: string[] = [];
    // OMR-read MC rows carry selectedOptions/omrMeta this grid doesn't show: carry them
    // forward on save and never delete such a row from here (it would vanish from the
    // MC verification queue).
    const existingById = new Map(
      (await scoreRepository.getBySubmissionId(examId, currentSub.id, key)).map((r) => [r.exerciseId, r]),
    );

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      const val = parsedScores[i];
      const existing = existingById.get(ex.id);

      if (val !== null && val !== undefined && !isNaN(val)) {
        if (val >= 0 && val <= ex.maxPoints) {
          toSave.push({
            id: crypto.randomUUID(),
            submissionId: currentSub.id,
            exerciseId: ex.id,
            score: val,
            selectedOptions: existing?.selectedOptions,
            omrMeta: existing?.omrMeta,
          });
          subScores[ex.id] = val;
        }
      } else if (existing?.omrMeta) {
        subScores[ex.id] = existing.score ?? null;
      } else {
        toClear.push(ex.id);
        subScores[ex.id] = null;
      }
    }

    await scoreRepository.saveMany(examId, currentSub.id, toSave, key);
    for (const exerciseId of toClear) {
      await scoreRepository.deleteOne(examId, currentSub.id, exerciseId);
    }

    currentSub.totalScore = liveTotalScore;
    await saveSubmissionEncrypted(currentSub, key);

    const policy = get(storagePolicyStore);
    if (policy.storageMode === "all-server") {
      try {
        await api.patch(`/exams/${examId}/submissions/${currentSub.id}/score`, {
          total_score: currentSub.totalScore ?? null,
        });
      } catch (err) {
        console.warn("Failed to sync score to backend:", err);
      }
    }

    onScoresChanged();
  }

  async function prevStudent() {
    await handleSaveCurrentStudent();
    if (currentStudentIndex > 0) {
      currentStudentIndex -= 1;
    }
  }

  async function nextStudent() {
    await handleSaveCurrentStudent();
    if (currentStudentIndex < students.length - 1) {
      currentStudentIndex += 1;
    }
  }
</script>

<div class="flex min-w-0 flex-col gap-4">
  {#if students.length === 0}
    <EmptyState title={$t("grading.manual.studentFirst.noStudents")}>
      <Button icon={faUsers} onClick={onOpenRoster}>{$t("grading.manual.studentFirst.openRoster")}</Button>
    </EmptyState>
  {:else if exercises.length === 0}
    <EmptyState title={$t("grading.manual.studentFirst.noExercises")}>
      <Button href="/exam/{examId}" variant="text">{$t("grading.manual.studentFirst.goToSetup")}</Button>
    </EmptyState>
  {:else}
    <div class="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-surface-sunken p-3">
      <div class="flex min-w-0 flex-wrap items-center gap-2">
        <label for="student-select" class="text-sm text-content">{$t("grading.manual.studentFirst.selectStudent")}</label>
        <select
          id="student-select"
          class="{controlClass} {controlSmClass} w-full sm:w-56"
          bind:value={currentStudentIndex}
          on:change={handleSaveCurrentStudent}
        >
          {#each students as st, idx}
            <option value={idx}>
              {idx + 1}. {st.studentName || $t("grading.manual.studentFirst.unnamed")} {st.studentNumber ? `(${st.studentNumber})` : ""}
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
          onClick={prevStudent}
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
          onClick={nextStudent}
        >
          {$t("grading.manual.studentFirst.nextStudent")}
        </Button>
      </div>
    </div>

    {#if currentStudent}
      <div class="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-surface-raised px-5 py-4">
        <div class="min-w-0">
          <h3 class="m-0 mb-1 text-lg font-semibold text-content">{currentStudent.studentName || $t("grading.manual.studentFirst.unnamedStudent")}</h3>
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
              {$t("grading.manual.studentFirst.ungraded")}
            </div>
            <div class="text-sm text-content">{$t("grading.manual.studentFirst.pointsFraction", { score: 0, max: totalMaxPoints })}</div>
          {/if}
        </div>
      </div>

      <TableScroller>
        <table class="data-table data-table-compact data-table-sticky">
          <thead>
            <tr>
              <th>{$t("grading.manual.studentFirst.colNum")}</th>
              <th>{$t("grading.manual.studentFirst.colName")}</th>
              <th>{$t("grading.manual.studentFirst.colMax")}</th>
              <th>{$t("grading.manual.studentFirst.colScore")}</th>
            </tr>
          </thead>
          <tbody>
            {#each exercises as ex, idx (ex.id)}
              {@const rawVal = rawInputs[idx] ?? ""}
              {@const numVal = parseFloat(rawVal.replace(",", "."))}
              {@const isInvalid = rawVal !== "" && (isNaN(numVal) || numVal < 0 || numVal > ex.maxPoints)}
              <tr>
                <td>{idx + 1}</td>
                <td><strong>{ex.name}</strong></td>
                <td>{$t("grading.manual.studentFirst.pointsSuffix", { points: ex.maxPoints })}</td>
                <td class="whitespace-nowrap">
                  <input
                    type="text"
                    bind:this={inputElements[idx]}
                    bind:value={rawInputs[idx]}
                    class="{controlClass} {controlSmClass} w-24 text-right font-semibold"
                    aria-invalid={isInvalid ? "true" : undefined}
                    placeholder="-"
                    on:keydown={(e) => handleKeyDown(e, idx)}
                    on:blur={handleSaveCurrentStudent}
                    on:change={handleSaveCurrentStudent}
                  />
                  <span class="ml-1.5 text-sm text-muted">
                    / {ex.maxPoints}
                  </span>
                </td>
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
          onClick={prevStudent}
        >
          {$t("grading.manual.studentFirst.savePrev")}
        </Button>
        <Button severity="success" icon={faCheck} onClick={handleSaveCurrentStudent}>
          {$t("grading.manual.studentFirst.saveScores")}
        </Button>
        <Button
          variant="outlined"
          severity="secondary"
          iconRight={faArrowRight}
          disabled={currentStudentIndex >= students.length - 1}
          onClick={nextStudent}
        >
          {$t("grading.manual.studentFirst.saveNext")}
        </Button>
      </div>
    {/if}
  {/if}
</div>
