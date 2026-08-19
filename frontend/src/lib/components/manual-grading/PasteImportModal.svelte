<script lang="ts">
  import "./PasteImportModal.css";
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
</script>

<div class="paste-modal-backdrop" on:click|self={onClose}>
  <div class="paste-modal">
    <div class="paste-modal-header">
      <h2>{$t("grading.manual.paste.title")}</h2>
      <button class="paste-modal-close" on:click={onClose}>✕</button>
    </div>

    <div class="paste-modal-body">
      <div class="paste-step-indicator">
        <span class="paste-step-dot" class:active={step === 1}>{$t("grading.manual.paste.step1")}</span>
        <span class="paste-step-dot" class:active={step === 2}>{$t("grading.manual.paste.step2")}</span>
        <span class="paste-step-dot" class:active={step === 3}>{$t("grading.manual.paste.step3")}</span>
      </div>

      {#if step === 1}
        <div>
          <p style="margin-top: 0; color: #cbd5e1;">
            {$t("grading.manual.paste.pasteHint")}
          </p>
          <textarea
            class="paste-textarea"
            bind:value={rawTsv}
            placeholder={$t("grading.manual.paste.textareaPlaceholder")}
          ></textarea>
        </div>
      {:else if step === 2}
        <div>
          <div style="display: flex; gap: 1rem; align-items: center; margin-bottom: 0.75rem;">
            <label style="color: #cbd5e1; font-size: 0.85rem;">
              <input type="checkbox" bind:checked={autoCreateStudents} />
              {$t("grading.manual.paste.autoCreate")}
            </label>
          </div>

          <div class="paste-preview-table-container">
            <table class="paste-preview-table">
              <thead>
                <tr>
                  <th>{$t("grading.manual.paste.colStatus")}</th>
                  <th>{$t("grading.manual.paste.colName")}</th>
                  <th>{$t("grading.manual.paste.colId")}</th>
                  {#each exercises as ex, idx}
                    <th>{ex.name} ({ex.maxPoints}p)</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each parsedRows as row}
                  <tr>
                    <td>
                      {#if row.matchedStudent}
                        <span class="paste-match-badge matched">{$t("grading.manual.paste.matched")}</span>
                      {:else if autoCreateStudents}
                        <span class="paste-match-badge new">{$t("grading.manual.paste.newStudent")}</span>
                      {:else}
                        <span class="paste-match-badge skipped">{$t("grading.manual.paste.skipped")}</span>
                      {/if}
                    </td>
                    <td><strong>{row.rawName}</strong></td>
                    <td>{row.rawNumber || "-"}</td>
                    {#each row.scores as score, idx}
                      {@const maxP = exercises[idx]?.maxPoints || 0}
                      {@const isInvalid = score !== null && (score < 0 || score > maxP)}
                      <td style={isInvalid ? "color: #ef4444; font-weight: bold;" : ""}>
                        {score !== null ? score : "-"}
                      </td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {:else if step === 3}
        <div style="text-align: center; padding: 1.5rem 0;">
          <h3 style="color: #38bdf8; margin-top: 0;">{$t("grading.manual.paste.readyTitle")}</h3>
          <p style="color: #cbd5e1;">
            {$t("grading.manual.paste.importingRecords", { count: parsedRows.length })}
          </p>
          {#if parsedRows.some((r) => r.isNew && autoCreateStudents)}
            <p style="color: #fbbf24; font-size: 0.85rem;">
              {$t("grading.manual.paste.newStudentsWarning", { count: parsedRows.filter((r) => r.isNew).length })}
            </p>
          {/if}
        </div>
      {/if}
    </div>

    <div class="paste-modal-footer">
      <button class="paste-modal-btn secondary" on:click={onClose}>{$t("common.cancel")}</button>

      <div>
        {#if step === 1}
          <button
            class="paste-modal-btn primary"
            disabled={!rawTsv.trim()}
            on:click={parseTsvData}
          >
            {$t("grading.manual.paste.nextPreview")}
          </button>
        {:else if step === 2}
          <button class="paste-modal-btn secondary" on:click={() => (step = 1)}>
            {$t("grading.manual.paste.back")}
          </button>
          <button class="paste-modal-btn primary" on:click={() => (step = 3)}>
            {$t("grading.manual.paste.nextConfirm")}
          </button>
        {:else if step === 3}
          <button class="paste-modal-btn secondary" on:click={() => (step = 2)}>
            {$t("grading.manual.paste.back")}
          </button>
          <button class="paste-modal-btn primary" on:click={executeImport}>
            {$t("grading.manual.paste.executeImport")}
          </button>
        {/if}
      </div>
    </div>
  </div>
</div>
