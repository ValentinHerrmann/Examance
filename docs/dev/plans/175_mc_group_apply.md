# Resolve #175: "Verknüpfte Aufgaben übernehmen" also adds the staged MC group

## Context
In the exam's "Aufgaben aus der Bibliothek verknüpfen" dialog, MC questions ticked in the MC tab only go into a staging list. They become a group only via the panel button "MC-Gruppe zur Prüfung hinzufügen". The footer button "Verknüpfte Aufgaben übernehmen" (`applyLibrarySelection` in `ExamExercisePicker.svelte`) ignores `mcStagingIds` and closes the dialog, so the staged questions are silently lost. Closing also skips the discard prompt, because `isLibraryDirty` only compares the standalone selection.

Goal: the footer button commits a pending staged group (with the title/scoring shown in the panel) together with the standalone selection, in one save. Discarding staged questions asks first. The panel button stays, for building several groups in one session.

## Step 0: draft PR for plan review (before any code)
- Create branch `claude/confident-gates-uhlrlk` from the default branch and push it with one commit that adds this plan as `docs/dev/plans/175_mc_group_apply.md`. Delete that file in the implementation commit.
- Open a **draft** PR (mirror the PR template if there is one). The body holds this plan and "Resolves #175"; the title is the one suggested under Git below.
- **Stop and wait** for the user's review comments on the plan. Implement steps 1–7 only after approval, folding in their feedback.

## Changes

1. **`frontend/src/lib/exam/mcGroupStaging.ts`** (pure logic, so it can be tested)
   - `commitStagedGroup(groups, { editingId, staged, title, scoringText }, newId?)` → `{ groups, memberIds, previousMemberIds } | null`: returns `null` when `!canFinalizeGroup(staged)`, otherwise wraps `applyGroup` and returns the previous members of the edited group.
   - `stagingChanged(staged, editingMemberIds)`: true when the staged list differs from the group being edited (or from `[]` for a new group).

2. **`McGroupStagingPanel.svelte`**: make `title` and `scoringText` `$bindable` props (default to the current constants; keep the prefill/reset `$effect.pre`), so the parent can read the draft when the footer button is clicked.

3. **`ExamLibraryModal.svelte`**
   - Keep `mcDraftTitle` / `mcDraftScoring` state and `bind:` them into the panel. The panel stays mounted only on the MC tab, so this state lives in the modal and survives tab switches.
   - Change `onApply` to `onApply: (draft: { title: string; scoringText: string }) => void`. The footer passes the current draft.
   - Footer label: with `mcStagingIds.length > 0`, show the new key `exam.libraryModal.applyWithGroupButton` ("Aufgaben und MC-Gruppe übernehmen" / "Apply exercises and MC group"). Otherwise keep `applyButton`.

4. **`ExamExercisePicker.svelte`**
   - Factor the body of `finalizeMcGroup` into `stageGroup(title, scoringText): boolean`, which calls `commitStagedGroup` + `adoptGroupMembers` and clears `editingMcGroupId` and `mcStagingIds`, without saving. `finalizeMcGroup` = `stageGroup` + `onSaveLinks()`.
   - `applyLibrarySelection(draft)`: call `stageGroup(draft.title, draft.scoringText)` first, then compute `groupedIds`/standalone as now (after the group exists, so its members are excluded), then do a single `onSaveLinks()` and close. Also clear the staging state on close.
   - `isLibraryDirty` also becomes true when `stagingChanged(mcStagingIds, editingMcGroup?.memberIds ?? [])`.

5. **i18n**: add `libraryModal.applyWithGroupButton` to `de/exam.ts` and `en/exam.ts`. Change no other keys, so the selectors in `docs/demo-instance/seed-exams.mjs` still match.

6. **Regression test**: new `frontend/tests/mcGroupStaging.test.ts` for `commitStagedGroup` (null when nothing is staged; a new group with the staged order; an edit keeps id/position and reports the previous members) and `stagingChanged`. Per the standing instruction, unit tests are not run here.

7. **Docs**: one sentence in `docs/user/exams.md` and `docs/de/user/exams.md` under `{#mc-groups}`: ticked MC questions are also added as a group when you apply the dialog; use the panel button to build several groups in one go.

## Verification
- `cd frontend && npx svelte-check --threshold error` and `npx eslint` on the touched files.
- Manual (human): exam page → add exercises → MC tab → tick 2 questions → click "Aufgaben und MC-Gruppe übernehmen" → the group appears in the exercise list and survives a reload. Tick questions, then Cancel → the discard prompt appears. Edit an existing group, change it, apply via the footer → the group is updated, not duplicated.

## Git
Commit on `claude/confident-gates-uhlrlk` and push to the draft PR from step 0. Suggested PR title: "Adding exercises to an exam now also adds ticked multiple-choice questions as a group, without a separate button click (#175)".
