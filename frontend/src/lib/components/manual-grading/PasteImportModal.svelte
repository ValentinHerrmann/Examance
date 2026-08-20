<script lang="ts">
  import { get } from "svelte/store";
  import { sessionStore } from "$lib/stores/session";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import { studentRepository } from "$lib/repositories/studentRepository";
  import { api } from "$lib/api/client";
  import { db } from "$lib/db/db";
  import {
    saveScoreEncrypted,
    deleteScoreEncrypted,
    saveSubmissionEncrypted,
  } from "$lib/db/dbEncryption";
  import { buildSubmissionMap } from "$lib/utils/studentLookup";
  import type {
    ExerciseRecord,
    StudentRecord,
    SubmissionRecord,
  } from "$lib/db/schema";
  import { t } from "$lib/i18n";
  import { Modal, Button, TableScroller } from "$lib/components/ui";

  export let examId: string;
  export let exercises: ExerciseRecord[] = [];
  export let students: StudentRecord[] = [];
  export let submissions: SubmissionRecord[] = [];
  export let scoresMap: Map<string, Record<string, number | null>> = new Map();
  export let onClose: () => void = () => {};
  export let onImportComplete: () => void = () => {};

  let step: 1 | 2 | 3 = 1;
  let rawTsv = "";

  // Mapping configurations
  let nameColIdx = 0;
  let numberColIdx = -1;
  let autoCreateStudents = true;

  interface ParsedRow {
    rawName: string;
    rawNumber?: string;
    matchedStudent?: StudentRecord;
    isNew: boolean;
    scores: (number | null)[];
  }

  let parsedRows: ParsedRow[] = [];
  let headerCells: string[] = [];

  let submissionMap = new Map<string, SubmissionRecord>();
  $: {
    buildSubmissionMap(submissions, students).then((m) => {
      submissionMap = m;
    });
  }

  function normalizeName(name: string): string {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]/g, "");
  }

  function findStudentMatch(name: string, num?: string): StudentRecord | undefined {
    if (num) {
      const matchByNum = students.find(
        (st) => st.studentNumber && st.studentNumber.trim() === num.trim()
      );
      if (matchByNum) return matchByNum;
    }

    const trimmedName = name.trim().toLowerCase();
    const exactNameMatch = students.find(
      (st) => st.studentName && st.studentName.trim().toLowerCase() === trimmedName
    );
    if (exactNameMatch) return exactNameMatch;

    const normName = normalizeName(name);
    return students.find(
      (st) => st.studentName && normalizeName(st.studentName) === normName
    );
  }

  function parseTsvData() {
    if (!rawTsv.trim()) return;

    const lines = rawTsv
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0);

    if (lines.length === 0) return;

    const matrix = lines.map((l) => l.split("\t"));
    headerCells = matrix[0] || [];

    // Auto-detect Name column
    let detectedNameCol = 0;
    let detectedNumCol = -1;

    headerCells.forEach((h, idx) => {
      const lower = h.toLowerCase().trim();
      if (lower.includes("name") || lower.includes("student")) {
        detectedNameCol = idx;
      }
      if (lower.includes("nr") || lower.includes("id") || lower.includes("matrikel")) {
        detectedNumCol = idx;
      }
    });

    nameColIdx = detectedNameCol;
    numberColIdx = detectedNumCol;

    updateParsedRows(matrix);
    step = 2;
  }

  function updateParsedRows(matrix?: string[][]) {
    if (!matrix) {
      const lines = rawTsv
        .split("\n")
        .map((l) => l.trimEnd())
        .filter((l) => l.length > 0);
      matrix = lines.map((l) => l.split("\t"));
    }

    const k = exercises.length;
    const rows: ParsedRow[] = [];

    for (let r = 0; r < matrix.length; r++) {
      const cells = matrix[r];
      const rawName = (cells[nameColIdx] || "").trim();
      if (!rawName) continue;

      // Skip header row if Name column contains literal "Name"
      if (r === 0 && rawName.toLowerCase() === "name") continue;

      const rawNumber = numberColIdx >= 0 ? (cells[numberColIdx] || "").trim() : undefined;
      const matched = findStudentMatch(rawName, rawNumber);

      // Trailing K exercise columns
      const exerciseScores: (number | null)[] = [];
      const totalCols = cells.length;

      for (let exIdx = 0; exIdx < k; exIdx++) {
        // Look at trailing K columns or matching indices
        const colIdx = totalCols >= k ? totalCols - k + exIdx : nameColIdx + 1 + exIdx;
        const cellVal = cells[colIdx] !== undefined ? cells[colIdx].trim().replace(",", ".") : "";

        if (cellVal === "") {
          exerciseScores.push(null);
        } else {
          const parsed = parseFloat(cellVal);
          exerciseScores.push(isNaN(parsed) ? null : parsed);
        }
      }

      rows.push({
        rawName,
        rawNumber,
        matchedStudent: matched,
        isNew: !matched,
        scores: exerciseScores,
      });
    }

    parsedRows = rows;
  }

  async function executeImport() {
    const key = get(sessionStore).sessionKey;
    const policy = get(storagePolicyStore);

    for (const row of parsedRows) {
      let student = row.matchedStudent;
      let pseudonymId: string;

      if (!student && autoCreateStudents) {
        pseudonymId = crypto.randomUUID();
        student = {
          pseudonymId,
          examId,
          studentName: row.rawName,
          studentNumber: row.rawNumber || undefined,
          piiCt: new Uint8Array(0),
          piiIv: new Uint8Array(12),
        };
        await studentRepository.save(student, key);

        const newSub: SubmissionRecord = {
          id: crypto.randomUUID(),
          examId,
          pseudonymHash: pseudonymId,
          createdAt: new Date().toISOString(),
        };
        await saveSubmissionEncrypted(newSub, key);
        submissions.push(newSub);
        submissionMap.set(pseudonymId, newSub);
      } else if (student) {
        pseudonymId = student.pseudonymId;
      } else {
        continue;
      }

      let sub = submissionMap.get(pseudonymId);
      if (!sub) {
        sub = {
          id: crypto.randomUUID(),
          examId,
          pseudonymHash: pseudonymId,
          createdAt: new Date().toISOString(),
        };
        await saveSubmissionEncrypted(sub, key);
        submissions.push(sub);
        submissionMap.set(pseudonymId, sub);
      }

      const activeSub = sub;
      let subScores = scoresMap.get(activeSub.id);
      if (!subScores) {
        subScores = {};
        scoresMap.set(activeSub.id, subScores);
      }

      for (let exIdx = 0; exIdx < exercises.length; exIdx++) {
        const ex = exercises[exIdx];
        const scoreVal = row.scores[exIdx];

        if (scoreVal !== null && scoreVal !== undefined && !isNaN(scoreVal)) {
          if (scoreVal >= 0 && scoreVal <= ex.maxPoints) {
            const existing = await db.exerciseScores
              .where("submissionId")
              .equals(activeSub.id)
              .and((item) => item.exerciseId === ex.id)
              .first();

            await saveScoreEncrypted({
              id: existing ? existing.id : crypto.randomUUID(),
              submissionId: activeSub.id,
              exerciseId: ex.id,
              score: scoreVal,
            }, key);
            subScores[ex.id] = scoreVal;
          }
        }
      }

      // Recompute total
      let isFully = true;
      let sumGraded = 0;
      for (const ex of exercises) {
        const val = subScores[ex.id];
        if (val === null || val === undefined) {
          isFully = false;
        } else {
          sumGraded += val;
        }
      }

      activeSub.totalScore = isFully ? Math.round(sumGraded * 100) / 100 : undefined;
      await saveSubmissionEncrypted(activeSub, key);

      if (policy.storageMode === "all-server") {
        try {
          await api.patch(`/exams/${examId}/submissions/${activeSub.id}/score`, {
            total_score: activeSub.totalScore ?? null,
          });
        } catch (err) {
          console.warn("Backend score sync error:", err);
        }
      }
    }

    onImportComplete();
    onClose();
  }

  const stepDotBase = "rounded px-[0.6rem] py-[0.2rem] text-xs bg-surface-inset text-muted";
  const stepDotActive = "rounded px-[0.6rem] py-[0.2rem] text-xs bg-accent-strong text-white font-semibold";
</script>

<Modal open={true} size="md" title={$t("grading.manual.paste.title")} onClose={onClose}>
  <div class="mb-2 flex gap-2">
    <span class={step === 1 ? stepDotActive : stepDotBase}>{$t("grading.manual.paste.step1")}</span>
    <span class={step === 2 ? stepDotActive : stepDotBase}>{$t("grading.manual.paste.step2")}</span>
    <span class={step === 3 ? stepDotActive : stepDotBase}>{$t("grading.manual.paste.step3")}</span>
  </div>

  {#if step === 1}
    <div>
      <p class="mt-0 text-content/90">
        {$t("grading.manual.paste.pasteHint")}
      </p>
      <textarea
        class="min-h-[180px] w-full resize-y rounded-md border border-line-strong bg-surface-base p-3 font-mono text-[0.85rem] text-content focus:border-accent-strong focus:outline-none"
        bind:value={rawTsv}
        placeholder={$t("grading.manual.paste.textareaPlaceholder")}
      ></textarea>
    </div>
  {:else if step === 2}
    <div>
      <div class="mb-3 flex items-center gap-4">
        <label class="text-[0.85rem] text-content/90">
          <input type="checkbox" bind:checked={autoCreateStudents} />
          {$t("grading.manual.paste.autoCreate")}
        </label>
      </div>

      <div class="max-h-[40dvh] overflow-y-auto rounded-md border border-line">
        <TableScroller>
          <table class="w-full border-collapse text-[0.85rem]">
            <thead>
              <tr>
                <th class="sticky top-0 border-b border-line bg-surface-base px-3 py-2 text-left font-semibold text-muted">{$t("grading.manual.paste.colStatus")}</th>
                <th class="sticky top-0 border-b border-line bg-surface-base px-3 py-2 text-left font-semibold text-muted">{$t("grading.manual.paste.colName")}</th>
                <th class="sticky top-0 border-b border-line bg-surface-base px-3 py-2 text-left font-semibold text-muted">{$t("grading.manual.paste.colId")}</th>
                {#each exercises as ex, idx}
                  <th class="sticky top-0 border-b border-line bg-surface-base px-3 py-2 text-left font-semibold text-muted">{ex.name} ({ex.maxPoints}p)</th>
                {/each}
              </tr>
            </thead>
            <tbody>
              {#each parsedRows as row}
                <tr>
                  <td class="border-b border-line px-3 py-2">
                    {#if row.matchedStudent}
                      <span class="inline-block rounded bg-emerald-500/15 px-[0.4rem] py-[0.15rem] text-xs font-medium text-emerald-400">{$t("grading.manual.paste.matched")}</span>
                    {:else if autoCreateStudents}
                      <span class="inline-block rounded bg-amber-500/15 px-[0.4rem] py-[0.15rem] text-xs font-medium text-amber-400">{$t("grading.manual.paste.newStudent")}</span>
                    {:else}
                      <span class="inline-block rounded bg-slate-500/20 px-[0.4rem] py-[0.15rem] text-xs font-medium text-muted">{$t("grading.manual.paste.skipped")}</span>
                    {/if}
                  </td>
                  <td class="border-b border-line px-3 py-2"><strong>{row.rawName}</strong></td>
                  <td class="border-b border-line px-3 py-2">{row.rawNumber || "-"}</td>
                  {#each row.scores as score, idx}
                    {@const maxP = exercises[idx]?.maxPoints || 0}
                    {@const isInvalid = score !== null && (score < 0 || score > maxP)}
                    <td class="border-b border-line px-3 py-2 {isInvalid ? 'font-bold text-red-500' : ''}">
                      {score !== null ? score : "-"}
                    </td>
                  {/each}
                </tr>
              {/each}
            </tbody>
          </table>
        </TableScroller>
      </div>
    </div>
  {:else if step === 3}
    <div class="py-6 text-center">
      <h3 class="mt-0 text-accent">{$t("grading.manual.paste.readyTitle")}</h3>
      <p class="text-content/90">
        {$t("grading.manual.paste.importingRecords", { count: parsedRows.length })}
      </p>
      {#if parsedRows.some((r) => r.isNew && autoCreateStudents)}
        <p class="text-[0.85rem] text-amber-400">
          {$t("grading.manual.paste.newStudentsWarning", { count: parsedRows.filter((r) => r.isNew).length })}
        </p>
      {/if}
    </div>
  {/if}

  <svelte:fragment slot="footer">
    <Button variant="secondary" onClick={onClose}>{$t("common.cancel")}</Button>

    <div class="ml-auto flex gap-2">
      {#if step === 1}
        <Button variant="primary" disabled={!rawTsv.trim()} onClick={parseTsvData}>
          {$t("grading.manual.paste.nextPreview")}
        </Button>
      {:else if step === 2}
        <Button variant="secondary" onClick={() => (step = 1)}>
          {$t("grading.manual.paste.back")}
        </Button>
        <Button variant="primary" onClick={() => (step = 3)}>
          {$t("grading.manual.paste.nextConfirm")}
        </Button>
      {:else if step === 3}
        <Button variant="secondary" onClick={() => (step = 2)}>
          {$t("grading.manual.paste.back")}
        </Button>
        <Button variant="primary" onClick={executeImport}>
          {$t("grading.manual.paste.executeImport")}
        </Button>
      {/if}
    </div>
  </svelte:fragment>
</Modal>
