<script lang="ts">
  import "./ExerciseFirstGrid.css";
  import { get } from "svelte/store";
  import { sessionStore } from "$lib/stores/session";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import { api } from "$lib/api/client";
  import { db } from "$lib/db/db";
  import { saveScoreEncrypted, deleteScoreEncrypted, saveSubmissionEncrypted } from "$lib/db/dbEncryption";
  import { buildSubmissionMap } from "$lib/utils/studentLookup";
  import type { ExerciseRecord, StudentRecord, SubmissionRecord } from "$lib/db/schema";
  import { t } from "$lib/i18n";

  export let examId: string;
  export let exercises: ExerciseRecord[] = [];
  export let students: StudentRecord[] = [];
  export let submissions: SubmissionRecord[] = [];
  export let scoresMap: Map<string, Record<string, number | null>> = new Map();
  export let onScoresChanged: () => void = () => {};
  export let onOpenRoster: () => void = () => {};

  let activeExerciseId: string = exercises[0]?.id || "";
  let inputElements: (HTMLInputElement | null)[] = [];

  $: if (exercises.length > 0 && (!activeExerciseId || !exercises.some((e) => e.id === activeExerciseId))) {
    activeExerciseId = exercises[0].id;
  }

  $: activeExercise = exercises.find((e) => e.id === activeExerciseId);
  let submissionMap = new Map<string, SubmissionRecord>();
  $: {
    buildSubmissionMap(submissions, students).then((m) => {
      submissionMap = m;
    });
  }

  // Local editable values map: studentIndex -> string value
  let rawInputs: Record<number, string> = {};

  $: {
    // Synchronize rawInputs whenever activeExerciseId, students, or scoresMap changes
    const newRaw: Record<number, string> = {};
    if (activeExerciseId) {
      students.forEach((st, idx) => {
        const sub = submissionMap.get(st.pseudonymId);
        if (sub) {
          const val = scoresMap.get(sub.id)?.[activeExerciseId];
          newRaw[idx] = val !== null && val !== undefined ? String(val) : "";
        } else {
          newRaw[idx] = "";
        }
      });
    }
    rawInputs = newRaw;
  }

  function handleKeyDown(e: KeyboardEvent, index: number) {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      if (index < students.length - 1 && inputElements[index + 1]) {
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

  async function handleScoreChange(st: StudentRecord, index: number) {
    if (!activeExercise) return;
    const sub = submissionMap.get(st.pseudonymId);
    if (!sub) return;

    const rawVal = rawInputs[index]?.trim().replace(",", ".");
    let numericVal: number | null = null;
    if (rawVal !== "" && rawVal !== undefined) {
      const parsed = parseFloat(rawVal);
      if (!isNaN(parsed)) {
        numericVal = parsed;
      }
    }

    // Bounds check
    if (numericVal !== null) {
      if (numericVal < 0 || numericVal > activeExercise.maxPoints) {
        // Keep invalid state visually
        return;
      }
    }

    const key = get(sessionStore).sessionKey;

    // Save or delete individual exercise score
    if (numericVal !== null) {
      const existing = await db.exerciseScores
        .where("submissionId")
        .equals(sub.id)
        .and((item) => item.exerciseId === activeExercise!.id)
        .first();

      await saveScoreEncrypted({
        id: existing ? existing.id : crypto.randomUUID(),
        submissionId: sub.id,
        exerciseId: activeExercise.id,
        score: numericVal,
      }, key);
    } else {
      await deleteScoreEncrypted(sub.id, activeExercise.id);
    }

    // Update in-memory scoresMap
    let subScores = scoresMap.get(sub.id);
    if (!subScores) {
      subScores = {};
      scoresMap.set(sub.id, subScores);
    }
    subScores[activeExercise.id] = numericVal;

    // Recompute total score for submission
    let isFullyGraded = true;
    let sumGraded = 0;
    for (const ex of exercises) {
      const sVal = subScores[ex.id];
      if (sVal === null || sVal === undefined || isNaN(sVal)) {
        isFullyGraded = false;
      } else {
        sumGraded += sVal;
      }
    }

    sub.totalScore = isFullyGraded ? Math.round(sumGraded * 100) / 100 : undefined;
    await saveSubmissionEncrypted(sub, key);

    const policy = get(storagePolicyStore);
    if (policy.storageMode === "all-server") {
      try {
        await api.patch(`/exams/${examId}/submissions/${sub.id}/score`, {
          total_score: sub.totalScore ?? null,
        });
      } catch (err) {
        console.warn("Failed to sync total score to server:", err);
      }
    }

    onScoresChanged();
  }

  // Calculate statistics for active exercise
  $: activeScores = students
    .map((st) => {
      const sub = submissionMap.get(st.pseudonymId);
      return sub ? scoresMap.get(sub.id)?.[activeExerciseId] : null;
    })
    .filter((v): v is number => v !== null && v !== undefined);

  $: gradedCount = activeScores.length;
  $: avgScore = gradedCount > 0
    ? Math.round((activeScores.reduce((a, b) => a + b, 0) / gradedCount) * 100) / 100
    : 0;
</script>

<div class="exercise-first-grid">
  {#if exercises.length === 0}
    <div class="exercise-grid-empty">
      <p>{$t("grading.manual.exerciseFirst.noExercises")}</p>
      <a href="/exam/{examId}" style="color: #38bdf8; text-decoration: underline;">{$t("grading.manual.exerciseFirst.goToSetup")}</a>
    </div>
  {:else if students.length === 0}
    <div class="exercise-grid-empty">
      <p>{$t("grading.manual.exerciseFirst.noStudents")}</p>
      <button on:click={onOpenRoster}>{$t("grading.manual.exerciseFirst.openRoster")}</button>
    </div>
  {:else}
    <div class="exercise-first-header">
      <div class="exercise-picker">
        {#each exercises as ex, idx}
          <button
            class="exercise-chip"
            class:active={ex.id === activeExerciseId}
            on:click={() => (activeExerciseId = ex.id)}
          >
            {ex.name || $t("grading.manual.exerciseFirst.exerciseFallback", { index: idx + 1 })} {$t("grading.manual.exerciseFirst.pointsSuffix", { points: ex.maxPoints })}
          </button>
        {/each}
      </div>

      {#if activeExercise}
        <div class="exercise-info">
          <h3>{activeExercise.name}</h3>
          <span class="exercise-max-tag">{$t("grading.manual.exerciseFirst.maxPointsLabel")} <strong>{activeExercise.maxPoints}</strong></span>
        </div>
      {/if}
    </div>

    <div class="exercise-grid-table-container">
      <table class="exercise-grid-table">
        <thead>
          <tr>
            <th>{$t("grading.manual.exerciseFirst.colNum")}</th>
            <th>{$t("grading.manual.exerciseFirst.colName")}</th>
            <th>{$t("grading.manual.exerciseFirst.colId")}</th>
            <th>{$t("grading.manual.exerciseFirst.colScore", { max: activeExercise?.maxPoints ?? 0 })}</th>
            <th>{$t("grading.manual.exerciseFirst.colStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {#each students as st, i (st.pseudonymId)}
            {@const sub = submissionMap.get(st.pseudonymId)}
            {@const valStr = rawInputs[i] ?? ""}
            {@const numVal = parseFloat(valStr.replace(",", "."))}
            {@const isInvalid = valStr !== "" && (isNaN(numVal) || numVal < 0 || (activeExercise && numVal > activeExercise.maxPoints))}
            <tr>
              <td>{i + 1}</td>
              <td><strong>{st.studentName || $t("grading.manual.exerciseFirst.unnamed")}</strong></td>
              <td>{st.studentNumber || "-"}</td>
              <td>
                <input
                  type="text"
                  bind:this={inputElements[i]}
                  bind:value={rawInputs[i]}
                  class="exercise-score-input"
                  class:invalid={isInvalid}
                  placeholder="-"
                  on:keydown={(e) => handleKeyDown(e, i)}
                  on:blur={() => handleScoreChange(st, i)}
                  on:change={() => handleScoreChange(st, i)}
                />
                <span style="font-size: 0.8rem; color: #94a3b8; margin-left: 0.35rem;">
                  / {activeExercise?.maxPoints}
                </span>
              </td>
              <td>
                {#if sub?.totalScore !== undefined}
                  <span style="color: #34d399; font-size: 0.825rem; font-weight: 500;">
                    {$t("grading.manual.exerciseFirst.totalScore", { score: sub.totalScore })}
                  </span>
                {:else if activeScores.length > 0}
                  <span style="color: #cbd5e1; font-size: 0.825rem;">{$t("grading.manual.exerciseFirst.inProgress")}</span>
                {:else}
                  <span style="color: #64748b; font-size: 0.825rem;">{$t("grading.manual.exerciseFirst.ungraded")}</span>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="exercise-grid-footer">
      <div>
        {$t("grading.manual.exerciseFirst.graded", { graded: gradedCount, total: students.length })}
      </div>
      <div>
        {$t("grading.manual.exerciseFirst.average", { name: activeExercise?.name ?? "", avg: avgScore, max: activeExercise?.maxPoints ?? 0 })}
      </div>
    </div>
  {/if}
</div>
