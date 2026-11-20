# One helper per job (issue #299)

The 2026-11 code review found second implementations of the same job, several of which had already drifted apart. Each job now has one keeper; the copies are gone. New code uses the keeper. Where nothing fits, add a new helper and enter it in the reuse map (`frontend/CLAUDE.md`, `backend/CLAUDE.md`).

## Frontend (`frontend/src/lib/`)

| Job | Keeper | Replaced copies | Behaviour change |
|---|---|---|---|
| Hex and SHA-256 hex | `crypto/hex.ts` (`bytesToHex`, `sha256Hex`) | `crypto/hmac.ts`, `crypto/pseudonymKey.ts`, `crypto/sri.ts`, `gdpr/exportAudit.ts`, `grading/mcExerciseHash.ts`, `grading/omrTemplatePrep.ts`, `latex/assets.ts`, `latex/compileCache.ts`, `sharing/shareCrypto.ts` | none (same digests) |
| Blob download | `utils/download.ts` (`downloadBlob`, `downloadUrl`) | the copy in `stats/chartExport.ts` (moved), `latex/CompileLogButton`, `routes/settings`, `admin/LayoutReports` | the object URL is revoked after the click everywhere; revoking it at once could cancel the download |
| File-name slug | `export/zip.ts` `slug` | chart names (`stats/ChartCard`), the grade CSV (`analytics/csvExport.ts`) | "Prüfung" becomes `Pruefung` in chart and CSV names too, not `Pr_fung` |
| Byte size text | `utils/format.ts` `formatBytes` | the copy in `latex/resources.ts` (moved), `layout-report/LayoutReportButton` | none |
| Browser storage | `utils/storage.ts` (`safeLocalStorage`, `safeSessionStorage`) | `stores/penInput.ts`, `layout/UpdateNotice`, `layout/DomainMoveNotice`, `layout/MaintenanceNotice`, `domainMove/index.ts`, `services/offlineQueue.ts` | the legacy-queue cleanup in `offlineQueue` no longer throws in a private window |
| Text order in lists people read | `utils/listSort.ts` `compareText` | about 14 raw `localeCompare` calls (library groups and variants, exports, contacts, analytics, admin domains, resource names, …) | natural, case-insensitive order: "2a" before "10a" |
| Byte-stable order | `utils/compare.ts` `compareCodeUnits` | `latex/compileCache.ts` keys (review item L12), `archive/conflicts.ts` page-break ids | cache keys no longer depend on the browser locale |
| Decimal input | `utils/parseDecimal.ts` `parseDecimal` (strict) | `manual-grading/ScoreGrid`, `ScoreInputCell`, `PasteImportModal`, `exercise/ExerciseStructurePanel`, `latex/exerciseStructure.ts`, `students/timeExtension.ts`, `exam/printLayout.ts`, `utils/examLabel.ts` | only a whole number counts ("5", "5,5", "5.5", ",5"): "5abc" and "1e3" are invalid in every field (the score grid and paste import used to read "5abc" as 5) |
| Result writes to the server | `services/resultsMover.ts` `serverResultWriters` | the archive import (`archive/unpacker.ts`) | none; one place builds the endpoints and payloads |

Ordering ISO timestamps with `localeCompare` (newest first and so on) is left as it is: the order is the same in every locale. `grading/mcExerciseHash.ts` still sorts exercise ids with `localeCompare`, because changing its sort could change hashes already stored on OMR template pins.

## Backend (`backend/app/`)

| Job | Keeper | Replaced copies | Behaviour change |
|---|---|---|---|
| Base64 encode | `schemas/binary.py` `encode_b64` (always set) and `encode_b64_or_none` (optional fields: None for no bytes) | the private `_b64` in `routers/exercise_scores.py`, `grading_reviews.py`, `submissions.py`, `keys.py`, `result_shares.py`, `services/result_shares.py` and `services/trash.py`, plus the inline calls in `exam_statistics`, `omr_template_pins`, `students`, `submissions`, `account_export`, `services/latex.py` and `cli.py` | none: optional fields stay None for empty bytes, required fields are always encoded |
| Base64 decode | `schemas/binary.py` `strict_b64decode` (ValueError) and `decode_b64` (400) | `services/logo.py`, `schemas/latex.py`, `services/trash.py` | the trash restore now decodes strictly |
| Daily quota | `services/ephemeral_store.py` `reserve_daily_quota` (returns a `DailyReservation` to `release`) | `routers/layout_reports.py`, `routers/training.py` | none (same keys, still hashed) |
| Own live exam | `services/exam_queries.py` `find_own_exam` | `dependencies.get_exam_for_teacher`, `services/logo.resolve_logo_for_compile`, `services/result_deliveries.require_own_exam` | none |
| Own exercise | `services/exam_queries.py` `find_own_exercise` | `dependencies.get_exercise_for_teacher`, `routers/exams._resolve_linkable_exercise`, `routers/exercises/library.delete_exercise` | none |

The WebAuthn helpers keep their URL-safe base64 (`services/webauthn.py`, `routers/webauthn.py`), which is a different encoding. `latex_worker.py` keeps its own decode, because the worker container must not import the app's schemas or settings.
