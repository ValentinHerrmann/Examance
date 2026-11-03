# Exam pages: structure and makeover (issue #212)

This page is the agreed target design for the pages under `/exam/...`, and the progress log of the makeover PR. The design was settled with the owner in a Q&A session; the decisions are listed under "Decisions" and are not to be re-opened without asking.

## Hand-over protocol (read first)

The work may be continued by another agent session at any time.

- Work top to bottom through the checklist. Tick a box (`[x]`) in the same commit that finishes the item, and commit and push after every item or every few files (`git push -u origin claude/peaceful-hopper-mo0rft`). Never leave more than one item half-done.
- If an item is only partly done, write what is left under "Progress notes" before committing.
- Before starting, read the root `CLAUDE.md`, `frontend/CLAUDE.md`, `docs/dev/ui_shell.md` and `docs/dev/result_sharing.md`.
- Verification is basic only (no unit-test runs): `cd frontend && npx svelte-check --threshold error`, `npm run lint`, and `cd docs && npm run docs:build`. Write regression tests, don't run them.
- One PR for everything (draft until the checklist is done). PR title (user-facing): "Clearer exam pages: numbered steps with progress and a 'Next' button, one page for exercises, layout and preview, a Print step for PDFs and QR codes, and a guided page for sending results (#212)".

## Problems (from the issue and the code review)

- The Setup page's action bar (`exam/ExamActionBar.svelte`) repeats Scan, Grade, Statistics and Students from the sidebar, in another order and without Check MC or Paper & Excel.
- One modal (`ExamMetadataEditor`) mixes metadata (title, class, date, teacher, retention), print layout (info text, name line, cut corner, MC hint, logo, packages) and the grading key; page breaks and extra notes are edited inline on the page instead.
- The page heading says "Setup"; testart, class, subject and date are only visible in the expanded desktop sidebar.
- Icons on some buttons only; a "+" glyph in "Add exercises"; three different delete icons.
- No sense of flow: steps are unnumbered and nothing says what is done or what comes next.
- QR stickers and result sharing are dialogs off the action bar; "Print keys" inside the share dialog discards its state (selection, channel, Artemis token).
- Manual grading's Roster tab and `PasteImportModal` create students with random ids (no sticker, no personal key), contradicting "student data only on the Students page".
- The exam-list cards list seven plain step links with no status.

## Decisions

- **Navigation:** keep `ExamSidebar` (from `lg`) and the `NavDrawer` (below). Steps get a number, an icon and a status badge; every step page except grade ends with a "Next: …" button. The Overview has no number.
- **Steps** (`layout/examNavItems.ts` stays the single list):

  | # | Step | Route | Status badge (cheap counts only) |
  |---|---|---|---|
  | – | Overview | `/exam/[id]` | – |
  | 1 | Exam (exercises, layout, preview) | `/exam/[id]/content` (new) | exercise count |
  | 2 | Students | `/exam/[id]/students` | student count |
  | 3 | Print | `/exam/[id]/print` (new) | ready when the OMR template exists |
  | 4 | Scans | `/exam/[id]/scan` | submission count |
  | 5 | Check MC | `/exam/[id]/verify` | open count, only once the verify page computed it this session |
  | 6 | Grading | `/exam/[id]/grade` | graded x/y |
  | 7 | Paper & Excel | `/exam/[id]/manual` | – |
  | 8 | Results | `/exam/[id]/results` (Statistics), `/exam/[id]/results/share` (Share) | shared count; not-reached badge only with `result_delivery` |

  A failed read leaves its badge out (never a 0).
- **Overview:** header with title and a metadata line (testart, class, subject, date, duration); actions "Edit details" and "Export" as icon buttons, and a ⋯ `ui/Menu` with Duplicate, Delete submissions, Delete exam (all through `ui/ConfirmDialog`, no native `confirm()`/`alert()`). Cards: Details (read-only metadata incl. teacher, topic, retention) and Key figures (points, exercises, students, scans, graded, average, grading key). Primary button "Continue: <next step>". No list of step links (that would duplicate the sidebar).
- **Exam step = one page** for arranging exercises and print layout, with the PDF preview. Left column: `ui/Tabs` "Exercises" (list, MC groups, page breaks, extra notes, "Add exercises") and "Layout" (info text, name line, cut corner, MC hint, logo, packages; explicit Save and an unsaved-changes guard). Right column: the preview panel (compile, task/solution, layout report, OMR template status). Below `@6xl` the preview becomes a third tab.
- **Metadata dialog** keeps metadata and retention only. **Grading key** moves to Results → Statistics, next to the distribution it changes.
- **Print step:** exam PDFs (download task and solution; OMR template status and refresh) and QR codes inline (sticker sheet, onto copies, key slips).
- **Results step:** `ui/Tabs` with href "Statistics | Share". Share is a page, not a modal: four numbered sections top to bottom (students, channel and setup, protection and options, preview and send) with a sticky "Preview & send (n)" footer, then delivery status and "Revoke all". Channels stay greyed out with the reason, never hidden. "Print keys" opens the sticker dialog on top, so the page state survives.
- **Roster tab:** hidden behind `const SHOW_ROSTER_TAB = false` (code kept until the owner approves on the preview; then a follow-up deletes it). Paste-import does not create unknown students while the flag is off. The Students page gets "Add student".
- **Exam-list cards:** progress row from the same status helper, primary "Continue: <step>", "Open overview", ⋯ menu (Preview, Export, Duplicate, Delete). The step links go.
- **Mebis** is dropped from the ZIP export (only the Share channel builds the Mebis ZIP).
- **Artemis class-list import** keeps the `result_delivery` gating but explains it as "Artemis connection not enabled by the admin".
- **Old URLs:** `/exam/[id]/stats` redirects (308, like `verify-item`) to `/results`; `?library=open` now targets `/content`, and `/exam/new` redirects there.
- No crypto, auth or retention logic changes: share and sticker code is only moved (`shareCrypto`, `stickerKey` untouched).

## Checklist

### 1. Shared building blocks
- [ ] `lib/exam/examProgress.ts`: pure function from `{ exercises, students, submissions, omrReady, mcOpen?, shares? }` to a status per `ExamStep`, plus `nextStep(current)`; unit test in `frontend/tests/`.
- [ ] `layout/examNavItems.ts`: new step list and routes (overview, content, students, print, scan, verify, grade, manual, results) with numbers; `lib/utils/links.ts` hrefs (`contentHref`, `printHref`, `resultsHref`, `shareHref`; drop `statsHref` after moving callers).
- [ ] `stores/shell.ts` `ExamNavContext` gains `progress`; `routes/exam/[id]/+layout.svelte` loads students (`studentRepository.getByExamId`), OMR template presence and, with `result_delivery`, `listResultDeliveries` (`latestDeliveries`/`undelivered`) after each navigation; the verify page publishes its open count.
- [ ] `ExamSidebar` and `NavDrawer`: number, icon, label, status badge (widen the open sidebar if needed and update `e2e/layout.spec.ts`).
- [ ] Action icons: check `lib/` for an existing verb-to-icon map; else add `components/ui/actionIcons.ts` (edit, delete, export, duplicate, add, external link, download, print, send); add it to the reuse map in `frontend/CLAUDE.md`.
- [ ] `exam/ExamStepFooter.svelte`: "Next: <step>" (`Button href`, same tab) from `examProgress`/`examNavItems`.

### 2. Overview and Exam pages (split the 853-line `routes/exam/[id]/+page.svelte`)
- [ ] `lib/exam/omrTemplate.ts`: OMR prepare/stale logic out of the page (`checkOmrTemplateStatus`, `handlePrepareOmr`, `computeExercisesHash`), usable by the Exam and Print pages.
- [ ] `exam/ExamPreviewPanel.svelte`: compile card (compile, `DualPdfPreview`, layout report, notices, `CompileErrorHelp`, OMR status); keep `layoutEditSeq`, `loadSeq` and `restoreCachedPreviews`.
- [ ] `exam/ExamLayoutSettings.svelte`: layout fields moved out of `ExamMetadataEditor` (info text, name line, cut corner, MC hint, `ExamLogoField`, `ExamPackagesField`); saves through `saveExamEncrypted` merged onto the stored record (never sends links or MC groups); dirty guard.
- [ ] `routes/exam/[id]/content/+page.svelte`: data via `lib/exam/loadExam.ts`, exercise list, picker (`?library=open`), editor modal, `buildExamLinkPayload()` (stays the single builder; update its path in `frontend/CLAUDE.md`), tabs and preview; under ~600 lines.
- [ ] `ExamMetadataEditor`/`ExamMetadataEditDialog`: metadata and retention only; success `alert()` becomes an inline notice; `/exam/new` redirects to `/content?library=open`.
- [ ] `routes/exam/[id]/+page.svelte` becomes the Overview (header, actions with `ui/Menu`, Details and Key figures cards, deletes through `ConfirmDialog`, "Continue"); delete `ExamActionBar.svelte` and `ExamMetadata.svelte` once unused.

### 3. Print step
- [ ] `sharing/StickerSheetForm.svelte` extracted from `StickerSheetDialog` (the dialog wraps it).
- [ ] Fix: a failed student read shows an error, not "no students yet" (regression test).
- [ ] Fix: "onto copies" disabled with its reason for results-only exams (`codeWithheld`) and without a compiled PDF; helper plus regression test.
- [ ] `routes/exam/[id]/print/+page.svelte`: exam PDFs, OMR status and refresh, `StickerSheetForm` inline, footer.

### 4. Results step
- [ ] Move `routes/exam/[id]/stats` to `routes/exam/[id]/results` with `results/+layout.svelte` (`ui/Tabs` href); `stats/+page.ts` 308 redirect.
- [ ] `StatsPage`: grading-key panel (`GradingKeyEditor`, live recompute, save merged onto the exam).
- [ ] Split `ShareResultsDialog` into `sharing/ShareStudents`, `ShareChannel` (with `DeliverySetup`), `ShareOptions` and the existing `DeliveryPreview`; `routes/exam/[id]/results/share/+page.svelte` with numbered sections, sticky footer, delivery status, "Revoke all"; sticker dialog on top keeps the state; delete `ShareResultsDialog.svelte`.
- [ ] Drop Mebis from the export: `ExamExportModal` option, `export/examExport.ts` mebis code, i18n keys, `docs/{,de/}user/results.md#export`, `docs/dev/result_sharing.md`.
- [ ] Artemis import reason text (own i18n key, en and de).
- [ ] Fix outdated "id from the QR sticker" texts: `sharing.channels.mebis.missing`, `sharing.channels.artemis.missing` (en, de), `docs/{,de/}user/students.md`.

### 5. Manual grading and Students
- [ ] `ManualGradingContainer`: `SHOW_ROSTER_TAB = false` (comment: delete in a follow-up once approved on the preview) and a link to the Students page.
- [ ] `PasteImportModal`: with the flag off, unknown names are listed as "not on the Students page" and skipped.
- [ ] Students page: "Add student" through `StudentEditDialog` (create mode) and `lib/students/classList.ts`, so the row gets a sticker payload.

### 6. Exam-list cards
- [ ] `dashboard/ExamList.svelte`/`ExamSummary`: progress row from `examProgress`, "Continue: <step>", "Open overview", ⋯ menu (Preview, Export, Duplicate, Delete); drop the step links.
- [ ] Fix: `routes/+page.svelte` passes the count of all submissions (not only graded) to `DeleteWithUsageModal`; `examStats` gets `submissionCount`; regression test.

### 7. Icons, i18n, docs, e2e
- [ ] Every button on the exam pages has an icon from the action-icon map; "+" glyph removed from "Add exercises"; delete icons unified.
- [ ] i18n en/de for all new keys; delete orphaned keys (`exam.actionBar.*`, the Setup label, mebis export keys).
- [ ] `docs/dev/ui_shell.md` (exam steps), `frontend/CLAUDE.md` reuse map (`ExamPreviewPanel`, `ExamLayoutSettings`, `examProgress`, `StickerSheetForm`, share sections, action icons).
- [ ] User guide en and de (same file names and anchors): `workflow.md`, `exams.md`, `students.md`, `results.md`, `scanning.md`; in-app help `lib/help/topics.ts` anchors; note in the PR that screenshots need a refresh from the demo instance.
- [ ] E2E: `e2e/helpers/nav.ts` step map, `e2e/helpers/seed.ts` `mainRoutes` (add content, print, results, results/share), `layout.spec.ts` sidebar checks, `functional.spec.ts` `gotoExamTab` callers, `tests/helpers/fakeApi.ts` for new reads.

### 8. Finish
- [ ] `git grep` for removed names (`ExamActionBar`, `ShareResultsDialog`, `statsHref`, mebis export keys): nothing orphaned.
- [ ] `npx svelte-check --threshold error`, `npm run lint`, `cd docs && npm run docs:build` clean.
- [ ] PR out of draft, description lists what to check on the preview: Overview, Exam and Print on phone, iPad portrait and 1920×1080; the "Next" chain from Overview to Results; `/stats` redirect; Share → Print keys keeps the selection; Roster tab hidden.

## Progress notes

- 2026-11-03: design agreed, checklist written. No code changes yet.
