# MC detection (OMR) internals

Developer notes for the optical mark recognition of multiple-choice answer boxes. Read before touching detection, the verify view, or `omrMeta`.

- **Params live only in `lib/grading/omrSettings.ts`.** The worker takes them per request; the user's next-run profile is `bg_omr_settings` in localStorage (`stores/omrSettings.ts`), snapshotted once per run.
- **Every detection stamps `omrMeta.run`**: params, the deciding `algorithmVersion` (= `params.algorithm`), and `pipelineVersion` (= `OMR_ALGORITHM_VERSION`), plus raw per-bubble `fillRatio` / `redoRatio` / `detectedState`, via `grading/omrResult.ts`. That file is the one builder for scan and re-run.
- **`mcScore.ts` builders must spread `...omrMeta`**, never enumerate fields, or the snapshot is lost on the first review.
- **A re-run never changes a verified result.** Rows where `isMcReviewed()` is true keep selection, score and review, and only get their recorded detection refreshed (`mergeRedetectionIntoVerified`, for comparing settings). Hand-typed scores are not touched.
- `detectedState` is immutable; `state` follows corrections.
- **Template freshness.** A stored template is reused only while its `exercisesHash` equals `computeOmrTemplateHash` (`grading/omrTemplatePrep.ts`): the MC answer key plus the blank sheet's full LaTeX. Anything that can move a bubble (any exercise body, item order, page breaks, header) changes it; the scan and verify pages then rebuild the template (issue #135).
- Bump `OMR_ALGORITHM_VERSION` when detection semantics change.
- **Algorithms.** `params.algorithm` decides: 4 = `measureBox` + stroke-based `classifyV4` (default), 2 = fill ratio (fallback). The worker always runs both and stores the other verdict per bubble as `alt`; the verify panel compares them on verified boxes. v3 (area thresholds on the clean v4 measurement) misread thin-pen crosses; do not gate crosses on fill again. v4 snaps its measuring window onto the printed border because the template rect sits ~0.5ex below the drawn box (`\OmrBox` links at the baseline, TikZ draws at `baseline=-0.5ex`).
- **`effectiveRedoRect` fixes a template bug.** `\OmrBox`'s redo link sits in a zero-width `\makebox[0pt][r]`, but a `\special` has no width, so the captured redo rect covers the box itself.
- **Overlay "unsure" frames** come from `detectedState` / `flaggedOptions` plus review status, never from `state` (review builders rewrite it). An `ambiguous` box counts by its persisted `provisional` (closer) reading until verified.
- **The verify view pairs boxes with options by `optionIndex`** (`grading/mcBoxOptions.ts`) and scores the selection with the current answer key. If the boxes are not exactly the options 0..n-1 (exercise edited after printing), it says so and does not score; never map one box's reading onto another option.
- **Grading views must never clear an OMR-read MC score row.** See the frontend gotchas in `frontend/CLAUDE.md`.

## Score boxes (issue #187)

The same template also fills the printed score boxes while grading.

- **Links.** `\OmrScoreSlot` (exercise and part boxes) and `\OmrScoreCell` (bottom table) in `Loesung.sty` put a borderless `omr://__box__/…` link over each blank: `task/<n>`, `part/<n>/<letter>`, `cell/<n>`, `sum`, `grade`, where `<n>` is the exam position (`\thePunkte`). The second path segment is never a bare number, so a frontend older than this never reads a box as a bubble (`grading/omrUri.ts` parses all links).
- **Template.** Since payload `version` 2 (`OMR_TEMPLATE_VERSION`) each page carries `scoreBoxes` (one rect per key, merged) and the payload `positions` (position -> exercise ids, one per block of `buildExerciseBlocks`, all members for an MC group). `positions` stays empty unless the captured exercise boxes match the blocks one to one. Exams without MC get a template too: built quietly after a preview compile (reusing that compile) and on the scan page, without banners. **The version is deliberately not part of the freshness hash**: forcing a re-capture would take the current `.sty` layout for sheets printed under an older one. A template captured before version 2 keeps working for MC; its exam gets score boxes after the next re-capture (an edit or a preview compile).
- **Placement.** Box positions are not stored per submission: the viewer and the graded-PDF export register each rendered page against the template (`grading/omrRegistration.ts`, the worker's own fiducial and homography code, with the teacher's OMR settings) and map the boxes through it. The viewer (`grading/scoreBoxLayer.ts`) aligns in the OMR worker (`REGISTER_PAGE`), lazily: only pages where a box has a value, once per page and scan; the export aligns only when a box has a value. No registration (fewer than 3 fiducials, page count differs from the template, legacy PNG scan, stale or missing template) means the boxes stay empty: never a number in the wrong place.
- **Values** come from `buildScoreBoxValues` (`grading/scoreBoxes.ts`): a box shows a value only once everything it sums is graded; Σ and grade need the whole exam (grade from the exam's grading key, empty without one). Drawn by `drawScoreBoxesForPage`, a non-persisted overlay like the OMR one.
- The template lives in this browser only (Dexie), so another browser fills the boxes after its first compile or scan-page visit.

