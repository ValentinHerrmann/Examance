# MC detection (OMR) internals

Developer notes for the optical mark recognition of multiple-choice answer boxes. Read before touching detection, the verify view, or `omrMeta`.

- **Params live only in `lib/grading/omrSettings.ts`.** The worker takes them per request; the user's next-run profile is `bg_omr_settings` in localStorage (`stores/omrSettings.ts`), snapshotted once per run.
- **Every detection stamps `omrMeta.run`**: params, the deciding `algorithmVersion` (= `params.algorithm`), and `pipelineVersion` (= `OMR_ALGORITHM_VERSION`), plus raw per-bubble `fillRatio` / `redoRatio` / `detectedState`, via `grading/omrResult.ts`. That file is the one builder for scan and re-run.
- **`mcScore.ts` builders must spread `...omrMeta`**, never enumerate fields, or the snapshot is lost on the first review.
- **A re-run never changes a verified result.** Rows where `isMcReviewed()` is true keep selection, score and review, and only get their recorded detection refreshed (`mergeRedetectionIntoVerified`, for comparing settings). Hand-typed scores are not touched.
- `detectedState` is immutable; `state` follows corrections.
- Bump `OMR_ALGORITHM_VERSION` when detection semantics change.
- **Algorithms.** `params.algorithm` decides: 4 = `measureBox` + stroke-based `classifyV4` (default), 2 = fill ratio (fallback). The worker always runs both and stores the other verdict per bubble as `alt`; the verify panel compares them on verified boxes. v3 (area thresholds on the clean v4 measurement) misread thin-pen crosses; do not gate crosses on fill again. v4 snaps its measuring window onto the printed border because the template rect sits ~0.5ex below the drawn box (`\OmrBox` links at the baseline, TikZ draws at `baseline=-0.5ex`).
- **`effectiveRedoRect` fixes a template bug.** `\OmrBox`'s redo link sits in a zero-width `\makebox[0pt][r]`, but a `\special` has no width, so the captured redo rect covers the box itself.
- **Overlay "unsure" frames** come from `detectedState` / `flaggedOptions` plus review status, never from `state` (review builders rewrite it). An `ambiguous` box counts by its persisted `provisional` (closer) reading until verified.
- **The verify view pairs boxes with options by `optionIndex`** (`grading/mcBoxOptions.ts`) and scores the selection with the current answer key. If the boxes are not exactly the options 0..n-1 (exercise edited after printing), it says so and does not score; never map one box's reading onto another option.
- **Grading views must never clear an OMR-read MC score row.** See the frontend gotchas in `frontend/CLAUDE.md`.
