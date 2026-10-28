<script lang="ts">
  import { untrack } from "svelte";
  import { get } from "svelte/store";
  import { sessionStore } from "#lib/stores/session";
  import { createStudentWithSubmission, saveSubmissionScores } from "#lib/grading/scoreService";
  import { buildSubmissionMap } from "#lib/utils/studentLookup";
  import { scoreRepository } from "#lib/repositories/scoreRepository";
  import { submissionRepository } from "#lib/repositories/submissionRepository";
  import type {
    ExerciseRecord,
    ExerciseScoreRecord,
    StudentRecord,
    SubmissionRecord,
  } from "#lib/db/schema";
  import { t } from "#lib/i18n";
  import { faArrowLeft, faArrowRight, faCheck } from "@fortawesome/free-solid-svg-icons";
  import { Badge, Button, Checkbox, Modal, TableScroller, Textarea } from "#lib/components/ui";

  interface Props {
    examId: string;
    exercises?: ExerciseRecord[];
    students?: StudentRecord[];
    submissions?: SubmissionRecord[];
    onClose?: () => void;
    onImportComplete?: () => void;
  }

  let {
    examId,
    exercises = [],
    students = [],
    submissions = [],
    onClose = () => {},
    onImportComplete = () => {},
  }: Props = $props();

  let step: 1 | 2 | 3 = $state(1);
  let rawTsv = $state("");

  // Mapping configurations
  let nameColIdx = 0;
  let numberColIdx = -1;
  let autoCreateStudents = $state(true);

  interface ParsedRow {
    rawName: string;
    rawNumber?: string;
    matchedStudent?: StudentRecord;
    isNew: boolean;
    scores: (number | null)[];
  }

  let parsedRows: ParsedRow[] = $state.raw([]);
  let headerCells: string[] = [];

  // Plain (only read by executeImport, which mutates it and the parent's `submissions` in place).
  let submissionMap = new Map<string, SubmissionRecord>();
  // Only the newest build may write, so a slower stale build cannot overwrite a newer map.
  let submissionMapSeq = 0;

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

  let importing = $state(false);
  let importError = $state("");

  async function executeImport() {
    if (importing) return;
    importing = true;
    importError = "";
    try {
      await importRows();
    } catch (err) {
      // Rows written so far stay; a retry reuses them (students created here are remembered on their row).
      importError = (err as Error)?.message || String(err);
      return;
    } finally {
      importing = false;
    }
    onImportComplete();
    onClose();
  }

  async function importRows() {
    const key = get(sessionStore).sessionKey;
    const exerciseIds = exercises.map((ex) => ex.id);
    // One read for the whole exam instead of one per row; the rows carry OMR data a pasted score must not drop.
    const existingBySub = new Map<string, Map<string, ExerciseScoreRecord>>();
    for (const row of await scoreRepository.getByExamId(examId, key)) {
      const rows = existingBySub.get(row.submissionId) ?? new Map<string, ExerciseScoreRecord>();
      rows.set(row.exerciseId, row);
      existingBySub.set(row.submissionId, rows);
    }

    for (const row of parsedRows) {
      let sub: SubmissionRecord | undefined;
      if (row.matchedStudent) {
        sub = submissionMap.get(row.matchedStudent.pseudonymId);
      } else if (autoCreateStudents) {
        const created = await createStudentWithSubmission(examId, {
          studentName: row.rawName,
          studentNumber: row.rawNumber || undefined,
          fallbackCode: undefined,
        });
        row.matchedStudent = created.student;
        sub = created.submission;
        submissions.push(sub);
        submissionMap.set(created.student.pseudonymId, sub);
      } else {
        continue;
      }

      if (!sub && row.matchedStudent) {
        sub = {
          id: crypto.randomUUID(),
          examId,
          pseudonymHash: row.matchedStudent.pseudonymId,
          createdAt: new Date().toISOString(),
        };
        await submissionRepository.save(sub, key);
        submissions.push(sub);
        submissionMap.set(row.matchedStudent.pseudonymId, sub);
      }
      if (!sub) continue;

      // Only valid pasted values are written; blank or out-of-range cells leave the stored score as it is.
      const values = new Map<string, number | null>();
      exercises.forEach((ex, idx) => {
        const val = row.scores[idx];
        if (val !== null && val !== undefined && !isNaN(val) && val >= 0 && val <= ex.maxPoints) values.set(ex.id, val);
      });
      await saveSubmissionScores(examId, sub, exerciseIds, values, {
        existing: existingBySub.get(sub.id) ?? new Map(),
      });
    }
  }

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
</script>

<Modal open={true} size="large" title={$t("grading.manual.paste.title")} error={importError} onClose={onClose}>
  <div class="mb-3 flex flex-wrap gap-2">
    <Badge severity={step === 1 ? "primary" : "secondary"}>{$t("grading.manual.paste.step1")}</Badge>
    <Badge severity={step === 2 ? "primary" : "secondary"}>{$t("grading.manual.paste.step2")}</Badge>
    <Badge severity={step === 3 ? "primary" : "secondary"}>{$t("grading.manual.paste.step3")}</Badge>
  </div>

  {#if step === 1}
    <div>
      <p class="mt-0 text-content">
        {$t("grading.manual.paste.pasteHint")}
      </p>
      <Textarea
        class="min-h-44 font-mono text-sm"
        bind:value={rawTsv}
        placeholder={$t("grading.manual.paste.textareaPlaceholder")}
      />
    </div>
  {:else if step === 2}
    <div>
      <div class="mb-3 flex items-center gap-4">
        <Checkbox bind:checked={autoCreateStudents} label={$t("grading.manual.paste.autoCreate")} />
      </div>

      <TableScroller maxHeight="max-h-96" class="rounded-md border border-line">
        <table class="data-table data-table-compact data-table-sticky">
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
                    <Badge severity="success" size="xs">{$t("grading.manual.paste.matched")}</Badge>
                  {:else if autoCreateStudents}
                    <Badge severity="warning" size="xs">{$t("grading.manual.paste.newStudent")}</Badge>
                  {:else}
                    <Badge severity="secondary" size="xs">{$t("grading.manual.paste.skipped")}</Badge>
                  {/if}
                </td>
                <td><strong>{row.rawName}</strong></td>
                <td>{row.rawNumber || "-"}</td>
                {#each row.scores as score, idx}
                  {@const maxP = exercises[idx]?.maxPoints || 0}
                  {@const isInvalid = score !== null && (score < 0 || score > maxP)}
                  <td class={isInvalid ? "font-bold text-danger-fg" : ""}>
                    {score !== null ? score : "-"}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </TableScroller>
    </div>
  {:else if step === 3}
    <div class="py-6 text-center">
      <h3 class="mt-0 text-lg font-semibold text-content">{$t("grading.manual.paste.readyTitle")}</h3>
      <p class="text-content">
        {$t("grading.manual.paste.importingRecords", { count: parsedRows.length })}
      </p>
      {#if parsedRows.some((r) => r.isNew && autoCreateStudents)}
        <p class="text-sm text-warning-fg">
          {$t("grading.manual.paste.newStudentsWarning", { count: parsedRows.filter((r) => r.isNew).length })}
        </p>
      {/if}
    </div>
  {/if}

  {#snippet footer()}
    <Button variant="outlined" severity="secondary" onClick={onClose}>{$t("common.cancel")}</Button>

    <div class="ml-auto flex gap-2">
      {#if step === 1}
        <Button iconRight={faArrowRight} disabled={!rawTsv.trim()} onClick={parseTsvData}>
          {$t("grading.manual.paste.nextPreview")}
        </Button>
      {:else if step === 2}
        <Button variant="outlined" severity="secondary" icon={faArrowLeft} onClick={() => (step = 1)}>
          {$t("grading.manual.paste.back")}
        </Button>
        <Button iconRight={faArrowRight} onClick={() => (step = 3)}>
          {$t("grading.manual.paste.nextConfirm")}
        </Button>
      {:else if step === 3}
        <Button variant="outlined" severity="secondary" icon={faArrowLeft} onClick={() => (step = 2)}>
          {$t("grading.manual.paste.back")}
        </Button>
        <Button icon={faCheck} loading={importing} disabled={importing} onClick={executeImport}>
          {$t("grading.manual.paste.executeImport")}
        </Button>
      {/if}
    </div>
  {/snippet}
</Modal>
