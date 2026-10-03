<script lang="ts">
  import { untrack } from "svelte";
  import { faUsers } from "@fortawesome/free-solid-svg-icons";
  import { Badge, Button, EmptyState, TableScroller, controlClass, controlSmClass } from "$lib/components/ui";
  import { get } from "svelte/store";
  import { sessionStore } from "$lib/stores/session";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import { api } from "$lib/api/client";
  import { db } from "$lib/db/db";
  import { saveSubmissionEncrypted } from "$lib/db/dbEncryption";
  import { scoreRepository } from "$lib/repositories/scoreRepository";
  import { buildSubmissionMap } from "$lib/utils/studentLookup";
  import type { ExerciseRecord, StudentRecord, SubmissionRecord } from "$lib/db/schema";
  import { t } from "$lib/i18n";

  interface Props {
    examId: string;
    exercises?: ExerciseRecord[];
    students?: StudentRecord[];
    submissions?: SubmissionRecord[];
    scoresMap?: Map<string, Record<string, number | null>>;
    onScoresChanged?: () => void;
    onOpenRoster?: () => void;
  }

  let {
    examId,
    exercises = [],
    students = [],
    submissions = [],
    scoresMap = new Map(),
    onScoresChanged = () => {},
    onOpenRoster = () => {},
  }: Props = $props();

  let activeExerciseId: string = $state(untrack(() => exercises[0]?.id || ""));
  let inputElements: (HTMLInputElement | null)[] = $state([]);

  $effect.pre(() => {
    const exs = exercises;
    const currentId = activeExerciseId;
    if (exs.length > 0 && (!currentId || !exs.some((e) => e.id === currentId))) {
      untrack(() => {
        activeExerciseId = exs[0].id;
      });
    }
  });

  let activeExercise = $derived(exercises.find((e) => e.id === activeExerciseId));
  // Raw: holds the parent's submission objects, which handleScoreChange mutates and persists.
  let submissionMap = $state.raw(new Map<string, SubmissionRecord>());
  // Only the newest build may write, so a slower stale build cannot overwrite a newer map.
  let submissionMapSeq = 0;
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

  // Editable buffer (studentIndex -> input string), bound by the inputs; reset when its sources change.
  let rawInputs: Record<number, string> = $state({});

  $effect.pre(() => {
    const exId = activeExerciseId;
    const sts = students;
    const subMap = submissionMap;
    const scores = scoresMap;
    untrack(() => {
      const newRaw: Record<number, string> = {};
      if (exId) {
        sts.forEach((st, idx) => {
          const sub = subMap.get(st.pseudonymId);
          if (sub) {
            const val = scores.get(sub.id)?.[exId];
            newRaw[idx] = val !== null && val !== undefined ? String(val) : "";
          } else {
            newRaw[idx] = "";
          }
        });
      }
      rawInputs = newRaw;
    });
  });

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

    // OMR-read MC rows carry selectedOptions/omrMeta this grid doesn't show: carry them
    // forward and never delete such a row from here (it would vanish from the MC
    // verification queue).
    const existing = (await scoreRepository.getBySubmissionId(examId, sub.id, key)).find(
      (r) => r.exerciseId === activeExercise.id,
    );

    // Save or delete individual exercise score
    if (numericVal !== null) {
      // The repository reconciles on (submissionId, exerciseId), which is also the
      // server's unique key.
      await scoreRepository.saveOne(
        examId,
        {
          id: crypto.randomUUID(),
          submissionId: sub.id,
          exerciseId: activeExercise.id,
          score: numericVal,
          selectedOptions: existing?.selectedOptions,
          omrMeta: existing?.omrMeta,
        },
        key,
      );
    } else if (existing?.omrMeta) {
      // keep the OMR row untouched
    } else {
      await scoreRepository.deleteOne(examId, sub.id, activeExercise.id);
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
  let activeScores = $derived(
    students
      .map((st) => {
        const sub = submissionMap.get(st.pseudonymId);
        return sub ? scoresMap.get(sub.id)?.[activeExerciseId] : null;
      })
      .filter((v): v is number => v !== null && v !== undefined),
  );

  let gradedCount = $derived(activeScores.length);
  let avgScore = $derived(
    gradedCount > 0 ? Math.round((activeScores.reduce((a, b) => a + b, 0) / gradedCount) * 100) / 100 : 0,
  );
</script>

<div class="flex min-w-0 flex-col gap-4">
  {#if exercises.length === 0}
    <EmptyState title={$t("grading.manual.exerciseFirst.noExercises")}>
      <Button href="/exam/{examId}" variant="text">{$t("grading.manual.exerciseFirst.goToSetup")}</Button>
    </EmptyState>
  {:else if students.length === 0}
    <EmptyState title={$t("grading.manual.exerciseFirst.noStudents")}>
      <Button icon={faUsers} onClick={onOpenRoster}>{$t("grading.manual.exerciseFirst.openRoster")}</Button>
    </EmptyState>
  {:else}
    <div class="flex flex-wrap items-center justify-between gap-4 rounded-md border border-line bg-surface-sunken p-3">
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
          <h3 class="m-0 min-w-0 text-lg font-semibold text-content">{activeExercise.name}</h3>
          <Badge>{$t("grading.manual.exerciseFirst.maxPointsLabel")} <strong class="ml-1">{activeExercise.maxPoints}</strong></Badge>
        </div>
      {/if}
    </div>

    <TableScroller>
      <table class="data-table data-table-compact data-table-sticky data-table-hover">
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
              <td class="whitespace-nowrap">
                <input
                  type="text"
                  bind:this={inputElements[i]}
                  bind:value={rawInputs[i]}
                  class="{controlClass} {controlSmClass} w-24 text-right font-semibold"
                  aria-invalid={isInvalid ? "true" : undefined}
                  placeholder="-"
                  onkeydown={(e) => handleKeyDown(e, i)}
                  onblur={() => handleScoreChange(st, i)}
                  onchange={() => handleScoreChange(st, i)}
                />
                <span class="ml-1.5 text-sm text-muted">
                  / {activeExercise?.maxPoints}
                </span>
              </td>
              <td>
                {#if sub?.totalScore !== undefined}
                  <span class="text-sm font-medium text-success-fg">
                    {$t("grading.manual.exerciseFirst.totalScore", { score: sub.totalScore })}
                  </span>
                {:else if activeScores.length > 0}
                  <span class="text-sm text-content">{$t("grading.manual.exerciseFirst.inProgress")}</span>
                {:else}
                  <span class="text-sm text-muted">{$t("grading.manual.exerciseFirst.ungraded")}</span>
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
</div>
