<script lang="ts">
  import "./StudentFirstGrid.css";
  import { get } from "svelte/store";
  import { sessionStore } from "$lib/stores/session";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import { api } from "$lib/api/client";
  import { db } from "$lib/db/db";
  import { saveScoreEncrypted, deleteScoreEncrypted, saveSubmissionEncrypted } from "$lib/db/dbEncryption";
  import { calculateGradeDetail } from "$lib/analytics/gradingKey";
  import { buildSubmissionMap } from "$lib/utils/studentLookup";
  import type {
    ExamRecord,
    ExerciseRecord,
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

    for (let i = 0; i < exercises.length; i++) {
      const ex = exercises[i];
      const val = parsedScores[i];

      if (val !== null && val !== undefined && !isNaN(val)) {
        if (val >= 0 && val <= ex.maxPoints) {
          const existing = await db.exerciseScores
            .where("submissionId")
            .equals(currentSub.id)
            .and((item) => item.exerciseId === ex.id)
            .first();

          await saveScoreEncrypted({
            id: existing ? existing.id : crypto.randomUUID(),
            submissionId: currentSub.id,
            exerciseId: ex.id,
            score: val,
          }, key);
          subScores[ex.id] = val;
        }
      } else {
        await deleteScoreEncrypted(currentSub.id, ex.id);
        subScores[ex.id] = null;
      }
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

<div class="student-first-grid">
  {#if students.length === 0}
    <div style="text-align: center; padding: 3rem 1rem; color: #94a3b8;">
      <p>{$t("grading.manual.studentFirst.noStudents")}</p>
      <button
        style="margin-top: 1rem; padding: 0.5rem 1rem; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer;"
        on:click={onOpenRoster}
      >
        {$t("grading.manual.studentFirst.openRoster")}
      </button>
    </div>
  {:else if exercises.length === 0}
    <div style="text-align: center; padding: 3rem 1rem; color: #94a3b8;">
      <p>{$t("grading.manual.studentFirst.noExercises")}</p>
      <a href="/exam/{examId}" style="color: #38bdf8; text-decoration: underline;">{$t("grading.manual.studentFirst.goToSetup")}</a>
    </div>
  {:else}
    <div class="student-first-picker-bar">
      <div class="student-picker-controls">
        <label for="student-select" style="font-size: 0.85rem; color: #cbd5e1;">{$t("grading.manual.studentFirst.selectStudent")}</label>
        <select
          id="student-select"
          class="student-picker-select"
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

      <div class="student-picker-controls">
        <button
          class="student-nav-btn"
          disabled={currentStudentIndex === 0}
          on:click={prevStudent}
        >
          {$t("grading.manual.studentFirst.prevStudent")}
        </button>
        <span style="font-size: 0.85rem; color: #94a3b8;">
          {currentStudentIndex + 1} / {students.length}
        </span>
        <button
          class="student-nav-btn"
          disabled={currentStudentIndex >= students.length - 1}
          on:click={nextStudent}
        >
          {$t("grading.manual.studentFirst.nextStudent")}
        </button>
      </div>
    </div>

    {#if currentStudent}
      <div class="student-summary-card">
        <div class="student-summary-info">
          <h3>{currentStudent.studentName || $t("grading.manual.studentFirst.unnamedStudent")}</h3>
          <p>{$t("grading.manual.studentFirst.studentInfo", { number: currentStudent.studentNumber || "-", code: currentStudent.fallbackCode || currentStudent.pseudonymId.slice(0, 8) })}</p>
        </div>

        <div class="student-grade-badge">
          {#if isFullyGraded && gradeDetail}
            <div class="student-grade-value">{gradeDetail.grade}</div>
            <div class="student-grade-label">{$t("grading.manual.studentFirst.gradeLabelPoints", { label: gradeDetail.label, score: sumGradedScores, max: totalMaxPoints })}</div>
          {:else if parsedScores.some((s) => s !== null)}
            <div class="student-grade-value" style="color: #f59e0b; font-size: 1.25rem;">
              {$t("grading.manual.studentFirst.pointsFraction", { score: sumGradedScores, max: totalMaxPoints })}
            </div>
            <div class="student-grade-label">{$t("grading.manual.studentFirst.incompleteGrading")}</div>
          {:else}
            <div class="student-grade-value" style="color: #64748b; font-size: 1.1rem;">
              {$t("grading.manual.studentFirst.ungraded")}
            </div>
            <div class="student-grade-label">{$t("grading.manual.studentFirst.pointsFraction", { score: 0, max: totalMaxPoints })}</div>
          {/if}
        </div>
      </div>

      <div class="student-exercise-table-container">
        <table class="student-exercise-table">
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
                <td>
                  <input
                    type="text"
                    bind:this={inputElements[idx]}
                    bind:value={rawInputs[idx]}
                    class="student-score-input"
                    class:invalid={isInvalid}
                    placeholder="-"
                    on:keydown={(e) => handleKeyDown(e, idx)}
                    on:blur={handleSaveCurrentStudent}
                    on:change={handleSaveCurrentStudent}
                  />
                  <span style="font-size: 0.8rem; color: #94a3b8; margin-left: 0.35rem;">
                    / {ex.maxPoints}
                  </span>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <div class="student-first-footer">
        <button
          class="student-nav-btn"
          disabled={currentStudentIndex === 0}
          on:click={prevStudent}
        >
          {$t("grading.manual.studentFirst.savePrev")}
        </button>
        <button class="student-save-btn" on:click={handleSaveCurrentStudent}>
          {$t("grading.manual.studentFirst.saveScores")}
        </button>
        <button
          class="student-nav-btn"
          disabled={currentStudentIndex >= students.length - 1}
          on:click={nextStudent}
        >
          {$t("grading.manual.studentFirst.saveNext")}
        </button>
      </div>
    {/if}
  {/if}
</div>
