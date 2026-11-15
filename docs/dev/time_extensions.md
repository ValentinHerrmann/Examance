# Working time, time extensions, large print and Examtimer

Issue #265. User guide: [Extra time, large print and the room timer](../user/students.md#special-needs).

## Working time of an exam

- `exams.duration_minutes` (nullable integer, 1 to 1440; `ExamRecord.durationMinutes`) holds the working time. `datum` holds the date only.
- Before migration `0067_exam_duration` the duration was free text in the bracket of `datum` (`"14.08.2026 (30 Minuten)"`). The migration moves a readable text (`30 Min`, `1,5 Std`, `2 h`, whole minutes only) into the column and strips the bracket. An unreadable text (`2 Schulstunden`) stays in `datum` and keeps printing as it is, so nothing is lost.
- The frontend applies the same rule to anything that still carries a bracket (old archives, ZIP exports, cached rows): `splitLegacyDatum` in `lib/utils/examLabel.ts`, called from `mapApiToExamRecord` and `mapExamRecordToApi`. The regex there and `split_legacy_datum` in the migration must stay the same.
- The printed header is built by `printedDatum(exam)`: `"<date> (N Minuten)"`. `Schulaufgabe.sty` still splits the bracket off `\Datum` itself, so the sty did not change. An exam whose old text was not exactly `N Minuten` prints a different `main.tex` and therefore has a new OMR template hash; it needs a new pin.
- The editor (`exam/ExamMetadataEditor`) has a whole-minutes input. Entering minutes replaces an old duration text. Only a bracket that holds a number counts as one (`legacyDuration`): a note such as `(Nachtermin)` stays part of the date and is printed before the minutes.
- `PATCH /exams/{id}` clears the working time on `duration_minutes: null` (like `topic`; for other fields null means "leave as it is").
- `contentStamp` hashes the printed date line, so an exam whose minutes only moved out of the date text keeps its print ticks.

## Per-student settings

Both fields live in the sealed payload of the student record (`STUDENT.sealed` in `lib/db/dbEncryption.ts`); the server never sees them and no migration was needed. They reveal a disadvantage compensation, so never copy them into a plain column, a log or an export without the teacher asking for it.

| Field | Meaning |
|---|---|
| `timeExtension?: { value, unit: 'min' \| '%' }` | Extra working time, absolute or as a share of the exam's working time |
| `largePrint?: boolean` | The personal copy is enlarged to A3 |

- A student save replaces the whole sealed record. Every writer with a field list carries both: `mergeScannedStudent` (`lib/scan/ingest.ts`), `mergeStudents` (`lib/students/classList.ts`), A new writer must do the same. The leftover merge in `studentRepository.getByExamId` leaves them out on purpose: the server copy decides, or a removed extension would come back from an old local row.
- They are edited only in `students/StudentEditDialog` (for one row or many) and shown in the roster's last list column.
- `lib/students/timeExtension.ts` is the only place that converts and prints an extension. A share is rounded **up to half minutes** (`extensionMinutes`). `printedExtension` gives `+10 Min` or `+25 % (+7,5 Min)`; without a working time a share prints as `+25 %`.
- Print: `stickerEntries` puts the printed extension and the A3 flag on each `StickerEntry`. `printedLabel` / `labelParts` (`lib/qr/stickerSheet.ts`) append the extension after number and name; when a label is too long only the name part is shortened. It appears on QR stickers, key strips, key slips and the corner tab of personalised copies. The exam header is the same for everybody.
- `studentsStamp` (`lib/exam/examChecks.ts`) includes both fields, and the working time when a share is in use, so changed values mark the print files as outdated.

## Large print (A3)

- The A3 copies are a print job of their own, `copiesA3` (`PRINT_JOBS`, `printJobs(plan, mode, largePrintOf(entries))` in `lib/exam/examChecks.ts`): `PrintPlan` shows the `copies` job with the other students and the `copiesA3` job with the large-print students, each with its own file, preview pane and tick. With nobody in one group that job does not exist. The sidebar counts the same jobs (`examChecksState.stamps.large`).
- `StickerSheetForm` with `largePrint` runs `renderExamCopies` followed by `scaleToA3` (`lib/qr/booklet.ts`, every page ×√2) and delivers `…_copies_A3.pdf`, always as loose duplex sheets, whatever the exam's booklet setting.
- The copy is the A4 sheet enlarged, not typeset again: page breaks, page codes, fiducials and answer boxes are identical, so there is one OMR template per exam.
- Scans: `scanViewport` (`lib/scan/scanViewport.ts`) renders an upright A3 page (within 5 % of 841.89 × 1190.55 pt) smaller by the factor that brings it to A4 width. Other odd page sizes keep their scale, because ink and boxes stored for them were made at it. Every renderer of scans uses it (ingest, the grading viewer, graded PDFs, MC crops, re-detection on the verify page), so ink, OMR boxes and score boxes share one pixel grid. The stored scan is never changed. A new place that renders a scan must use it too.
- Limit: a landscape page of A3 size is an unfolded booklet sheet and is split in two (`isA3Landscape`). An A3 copy must therefore be scanned upright.

## Examtimer export

`lib/export/examTimer.ts` builds the data, `exam/ExamTimerDialog` (opened through `open(exam)` from the Overview and the Students page) offers it as a file and as a link.

```json
{
  "format": "examtimer-import",
  "version": 1,
  "settings": {
    "course": "10a",
    "subject": "Mathematik",
    "exam": "Kurzarbeit 1",
    "duration": "45",
    "extensions": [
      { "value": 10, "unit": "min", "label": "" },
      { "value": 25, "unit": "%", "label": "" }
    ]
  }
}
```

- `settings` uses the keys of Examtimer's own settings object (`examTimerSettings` in its `localStorage`); keys that are absent keep their value there.
- One entry per distinct extension. `label` is empty unless the teacher ticks "Show first names", and then it is the first name only where exactly one student holds that extension.
- File: the JSON above, `<exam>_examtimer.json`. Link: `<address>control.html#import=<base64url of the UTF-8 JSON>`. The fragment is never sent to a server, and the link is opened with `noopener noreferrer`.
- The address is `timerUrl()`: the teacher's setting in `localStorage` (`bg_examtimer_url`, Settings → Examtimer), else `DEFAULT_TIMER_URL`. Only `https` addresses (or `http` on localhost) are accepted.
- A change to the format bumps `TIMER_FORMAT_VERSION` and needs the matching change in Examtimer's importer.
