# Hand-over plan: PR #335 (issues #234, #235), grading focus round 4

Temporary file for a hand-over between agent sessions; delete it before the PR is merged. The branch is `claude/inspiring-cannon-lgyud3` and PR #335 stays a draft. Commit after each finished bullet below, once the build is clean (`cd frontend && npx svelte-check --threshold error`, `npx vitest run tests/exerciseRegions.test.ts`).

## Where the code lives
- `frontend/src/lib/grading/exerciseRegions.ts`: areas from the score boxes, `acceptsNear` (5 mm tolerance), `regionAccepts`, `dimBands`, `targetRegion`, `header`.
- `frontend/src/lib/grading/exerciseGuard.ts`: when to ask (`GUARD_COOL_OFF_MS`), page choices.
- `frontend/src/lib/grading/focusLayer.ts`: canvas↔template mapping, `paintFocus`.
- `frontend/src/lib/components/grading/exerciseFocus.ts`: the viewer glue (ask, paint, `follow` scroll).
- `frontend/src/lib/components/grading/ExerciseSwitchDialog.svelte`, `CanvasNotice.svelte` (floating notice over the scan), `ScanCanvasViewer.svelte` (~600 lines, keep it from growing).
- Tests: `frontend/tests/exerciseRegions.test.ts`. Docs: `docs/user/grading.md` and `docs/de/user/grading.md` `#exercise-check`, `docs/dev/omr.md` "Exercise areas".

## Tasks (owner's feedback, in order; one commit each)

Status: tasks 1–5 are done (commits "one dim level, …" and "cool-off banner"). Waiting for the owner's next feedback; delete this file before merging.

1. **One dim level.** Drop the light/strong distinction: every dimmed area gets the same opacity (`DimLevel` becomes 0/1, `DIM_ALPHA` one value).
2. **Part selected → only the part is clear.** The parent exercise's intro (area between the task box and its first part box) is dimmed while a part is the target. `regionAccepts`: an intro/MC area (`partLabel === null`) accepts only `partLabel === ''` targets (whole exercise, rest, MC member); a part area only its own part. The guard follows this too: marking in the intro while a part is active asks (the picker lists that exercise's targets). This keeps "undimmed == never asks".
3. **Points table always dimmed.** The table at the end (header row with 1…n, Σ, Note; max-points row; cell row) is its own always-dimmed area. The cell boxes are its last row, so the table top ≈ cell box top + 2 × row height (row height ≈ the cell rect height) + a few pt. Store `map.table = {start, end}` like `map.header` (end = the end of that page). It stays an area without an exercise for the guard (picker).
4. **Page-break artefact.** Next to page edges, an undimmed strip shows (the bottom of page n, the top of page n+1), because template y=0 and y=pageHeight map inside the canvas through the homography or scale. In `paintFocus`, snap a band that starts at template top 0 to canvas y 0, and one that ends at the page height to the canvas height.
5. **Cool-off 30 s with a banner.** `GUARD_COOL_OFF_MS = 30_000`. After "Stay on …", show a `CanvasNotice` with:
   - a very compact text (DE "Aufgabenwechsel pausiert", EN "Exercise switching paused");
   - a draining (reverse-loading) progress bar over the 30 s;
   - a button "Resume now" / "Jetzt fortsetzen" that ends the cool-off at once (`ExerciseGuard.endCoolOff()`).
   
   Extend `CanvasNotice` (`progress: true` + `timeoutMs`, `onClose`), don't fork it. Closing with × ends the cool-off as well. Hide the notice and end the cool-off on a student change (`ExerciseFocus.newDocument`). Update the docs (30 s, banner).

After every task: update the PR body if the behaviour changed and keep the docs in sync.
