# Personal exam statistics (issue #238)

Analytics used to be computed only from raw results. They therefore vanished when retention purged an exam's results, and in `hybrid` mode they existed only in the browser that held the results. Each exam now has one **statistics record**: an anonymised, end-to-end encrypted score matrix that the server keeps in every storage mode, and that outlives the results.

## What is personal data

| Data | Class | Where it lives in `hybrid` |
|---|---|---|
| Student identities, scans, ink and comments, per-student scores and totals, MC choices, OMR metadata | Personal (pseudonymous, GDPR Art. 4(5)): every row is tied to a pseudonym | This browser only |
| Exams, exercises, grading key, MC groups, print layouts | Not about pupils | Server (both modes) |
| Statistics record | Anonymised score matrix, still sealed client-side | Server (both modes) |

The record (`frontend/src/lib/analytics/statisticsSnapshot.ts`, payload `v: 1`) holds:
- **exam metadata**: title, type, class/course, date, subject, topic, number of versions and grading key, never `lehrernachname`, so the record still reads after the exam is deleted;
- **exercise metadata**: id, name, maximum points, question type, variant and group;
- **one row per graded paper**: `{total, scores: {exerciseId: points}, mc: {exerciseId: options}}`, shuffled with `crypto.getRandomValues`.

A row never carries a pseudonym, submission id, timestamp, scan, annotation or `omrMeta`. The admin switch `server_results` does not gate the record, because it holds no per-student data. In a very small class a row can still be recognisable to someone who knows the class, which is why the record stays sealed under the data key (AAD `examStats:v1:<examId>`): only the teacher can open it.

## Lifecycle

- **Writing** (`lib/analytics/statisticsSync.ts`): result writers (`scoreRepository.saveMany`/`deleteOne`, `submissionRepository.save`/`delete`/`clearGrading`, `studentRepository.delete`, trash restore) call `markStatisticsDirty(examId)` (`statisticsDirty.ts`, dependency-free so repositories import it without a cycle).
  - About 3 s later the exam is rebuilt from its results wherever the mode keeps them and sent with `PUT /exams/{id}/statistics`.
  - The PUT is idempotent and safe to replay from the offline queue: an older `computed_at` never replaces a newer record (the newer one is returned).
- **Empty results**: when a dirty rebuild finds nothing graded, the teacher's own delete emptied the exam (for example "delete all results" or erasing the last student), so the record is deleted. An empty build never overwrites a record.
- **Retention**: the server's results purge (`services/retention.py` steps 1–2) and the local `RetentionModal` delete only results, never the record.
- **Deleting an exam**: the delete dialogs (`stats/KeepStatisticsOption`) send the teacher's choice with `PATCH /statistics/{id}` before the delete.
  - The exam row goes into the trash at once, so `exam_statistics.exam_id` has **no foreign key**.
  - When the exam is erased for good (trash purge, or retention step 11 for soft-deleted exams), `services/exam_statistics.forget_exams` drops the records not marked `keep_after_exam_delete`.
  - A trash restore never does (`trash.purge(..., restored=True)`).
- **Account deletion** cascades through `teacher_id`.
- **Backfill**: once per workspace (`localStorage` flag `bg_statistics_backfill_v1:<workspace id>`), the sync writes a record for every exam whose results are readable here and that has none yet.

## Reading

- `snapshotRecords()` turns a record into stand-in exam, exercise, submission and score records (ids `stats:<exam>:<n>`). Every existing statistics function therefore reads it unchanged.
- **Results page**: falls back to the record when no results are left. It then hides the CSV export and the borderline links, and offers "Delete my personal statistics".
- **Analytics** (`lib/analytics/keptStatistics.ts`): an exam without graded results here counts through its record. Records of deleted exams are listed with a delete action.
- **ZIP export**: `summary.pdf` (`export/examExport.ts`) uses the record when no results are left.
- **Password archive** (`.examance`): carries the decrypted records of the exams in scope as `examStatistics`. The importer rebuilds the record from imported results and otherwise re-seals the archived one, with its exam and exercise ids remapped (`remapSnapshot`).
- **Storage-mode move**: needs nothing, because the record is on the server in both modes.

Endpoints (`backend/app/routers/exam_statistics.py`, all behind `get_teaching_teacher`): `GET /statistics`, `PUT /exams/{id}/statistics`, `PATCH /statistics/{id}`, `DELETE /statistics/{id}`.
