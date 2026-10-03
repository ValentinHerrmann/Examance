# Frontend conventions

Loads when working under `frontend/`. Cross-cutting rules are in the root `CLAUDE.md`.

SvelteKit 2.5 on **Svelte 4 (not 5)**, TypeScript, Vite 5, Tailwind v4, `adapter-static` → `build/`. Notable libs: `argon2-browser`, `dexie` (IndexedDB, primary encrypted store in local mode), `pdf-lib`/`pdfjs-dist`, `zxing-wasm` (QR decode) / `qrcode`, `texlyre-busytex` (WASM LaTeX). `svelte-check --threshold error` should be clean; treat any error as new. Build/CSP/BusyTeX details: `docs/dev/build_and_csp.md`.

## Components

- New components go in `src/lib/components/<feature>/`. Shared primitives live in `components/ui/` (list: `ui/index.ts`, import from `$lib/components/ui`). Loose files at the `components/` root are legacy; don't copy them.
- Routes hold data loading, handlers and session state; components hold markup. Wire with callback props (`onAction={handler}`, `bind:value`), **not** `createEventDispatcher`. Four legacy roots still use it (`DualPdfPreview`, `ExerciseEditorModal`, `LatexEditor`, `StoragePolicyModal`); don't follow them.
- Prop-drilling exception: `src/lib/grading/gradingStore.ts`. Leaf grading components subscribe directly (15+ interdependent fields, justified in-file).
- Svelte 4 only re-runs a template expression when a name it mentions changes. A plain `function` helper that reads reactive state hides that dependency (`{@const { x } = box(c)}` never re-ran when `box` read a `$:`-derived `px`). Declare such helpers as `$: box = (c) => …` (see `stats/ColumnChart.svelte`); pure helpers that use only their arguments can stay plain functions.

## Design system (Artemis look, tokens re-implemented, no code copied)

- **Inline Tailwind utilities in markup** are the house dialect. A component `<style>` block is only for what utilities cannot express (a class shared by many siblings, a keyframe). Never add a `.css` file; the only ones are `src/app.css` and `routes/+layout.css`.
- **Light + dark** via `<html data-theme>`, resolved by `lib/stores/theme.ts` (pref `bg_theme`: `system`/`light`/`dark`). An inline no-flash script in `app.html` applies it before first paint; its storage key must stay in sync with the store.
- **Tokens** live in `@theme static` blocks in `src/app.css` (light plus a dark override set). Use the token utility (`bg-surface-raised`), never a raw hex or Tailwind shade. Families: surfaces, lines, text (`content`/`muted`/`subtle`), `accent` (text/links) vs `primary` (fills) + `primary-contrast`, state families `danger|success|warning|info` each with `-contrast` (text on the fill) and `-fg` (text on a surface), `navbar*`, widths `max-w-form|narrow|medium|wide|page`, z-index ladder vars (`--z-dropdown` 1000 / `--z-modal` 2000 / `--z-toast` 3000), grade colours.
- **Rules**: never use a fill colour (`primary`, `danger`, …) as text colour; use `accent` / `*-fg`. Radius `md` for controls and panels, `xl` for cards and dialogs. No emoji/glyph chrome: icons are FontAwesome through `ui/Icon` with per-icon imports from `@fortawesome/free-solid-svg-icons`. Variant maps (`{ primary: "bg-primary …" }`) must hold literal class strings so Tailwind sees them. `PageShell` is the one page root.
- **Overview lists** (exam page `routes/+page.svelte`, exercise library `routes/exercises/+page.svelte`) share one set of parts; extend them, don't fork: `ui/FilterLayout` (+ `common/ListFilterPanel`, `utils/listFilter.ts`), `ui/ExpandableCard`, `utils/lazyMap` + `utils/expandSet` (errors are `error`, never "empty"), `common/DeleteWithUsageModal` over `ConfirmDeleteModal` (`busy` + inline `error`, no `alert()`), `stores/previewFlow` + `common/PreviewHost` (Preview = last compile from the in-memory `compileCache`, else compile in the modal; owns the object URLs), `exercise-library/groupExercises`. Lists stay visible while refreshing (`isLoading` = first load only; overlapping refreshes coalesce). Exam compile (preamble, `buildExerciseInputs`, resources) lives in `lib/exam/examPreview.ts`, shared by the exam page, OMR prep and the dashboard preview.
- **Modal** (every dialog goes through it): sizes `small|medium|large|full` + `tall`; backdrop click is off by default (`closeOnBackdrop`) so a stray click cannot discard input; below `sm` everything but `small` is a full-height sheet. The panel is a size container, so inside it use `@md:`/`@xl:` container variants. Scroll lock goes through `lib/utils/scrollLock.ts` and locks `.app-main`. Only the topmost modal handles Escape/Tab.
- **Tables**: `.data-table` (+ `-compact|-striped|-hover`) in `app.css`, wrapped in `TableScroller`.

## Responsive and app shell

- **Mobile-first, always.** Unprefixed classes describe the phone; `sm:`/`md:`/`lg:`/`xl:` add back. Tailwind's default breakpoints only (640/768/1024/1280). **Never** `max-[900px]:`, `max-md:`, or a raw `@media` in component code. Every grid/flex child that can hold wide content needs `min-w-0`.
- `lib/stores/viewport.ts` (`isPhone`/`isTablet`/`isDesktop`/`isTouch`) is only for places where a narrow screen changes *behaviour*. Anything purely visual belongs in a breakpoint variant.
- **Target devices**: unscaled 1920×1080 (primary); 1920×1080 laptops at 125/150 % scaling (1536×730, 1280×600, tight height); iPad Pro 12.9″ portrait 1024 (= `lg`) and landscape, touch/pencil; 6–7″ phones portrait. Touch targets ≥44px via `pointer-coarse:`.
- **Shell** (`routes/+layout.css`): `.app-layout` is `100dvh` with `overflow: clip`, body is `overflow: hidden`, and `.app-main` is the only scroller. `AppFooter` is the last child of `.app-main` on every route; the grade root fills via `flex-1 min-h-0`. Don't reintroduce `overflow: hidden` on the layout, don't nest a second `100vh`/`100dvh`, and never put `min-h-full`/`h-full` on a page root (page plus footer would overflow by the footer's height); centred pages use `PageShell center`.
- `AppNavbar` shows links from `xl`, burger + `NavDrawer` below; minimal variant on locked/public pages; none on the grade page. Exam steps live in `ExamSidebar` from `lg` (pref `bg_sidebar_collapsed`), in the drawer below; `routes/exam/[id]/+layout.svelte` publishes `examNavContext` (`lib/stores/shell.ts`) for both.
- E2E: `npm run test:e2e` (Playwright, projects `desktop` 1920×950, `ipad-portrait`, `phone`; all-local mode, no backend; shell navigation in `e2e/helpers/nav.ts`).

## i18n (German / English)

UI text lives in typed catalogs under `src/lib/i18n/`; language toggle in `AppNavbar.svelte`, radio section in `SettingsForm.svelte`.

- `de/<ns>.ts` is the **source of truth** (`export const <ns> = {...} as const`). `en/<ns>.ts` is annotated `Translations['<ns>']`, so a missing or misspelled key is a `svelte-check` error. `types.ts` widens the literals back to `string` (German pins key *structure*, not wording). A new namespace must be added to both `de/index.ts` and `en/index.ts`.
- Markup: `{$t("ns.key")}`, `{$t("ns.key", { name })}`. Plain `.ts`, `alert`/`confirm`/`prompt`: `translate("ns.key")`. Runtime-composed keys: `tOptional` / `translateOptional`. Dates and numbers: `$fmt.date` / `$fmt.number` / `$fmt.percent` from `lib/utils/format.ts`.
- Locale is `bg_locale` in `safeLocalStorage`, detected as saved → `navigator.language` → `en`. Missing key falls back to German, then to the key. Interpolation only, no ICU plurals.
- Backend errors are localized **client-side** by the `code` the API sends next to its English `detail` (`errors.code.<CODE>`, applied in `lib/api/client.ts`); `err.message` stays the fallback.
- **Exam/PDF output is deliberately NOT translated**: `Schulaufgabe.sty` captions, `\begin{Aufgabe}`, `\Loesung*`, the MC rubric prose and German seed defaults (`testart`/`fach`/`title`) are exam content and a stable macro API. `routes/exam/new` keeps `toLocaleDateString("de-DE")` because that value is printed in the PDF.
- Legal pages: German is legally binding (§ 5 DDG, Art. 12 DSGVO). `en/legal.ts` holds the German text as a placeholder; **never** machine-translate it.
- `tests/locale.test.ts` guards detection, persistence, interpolation and de/en key parity.

## Multiple Choice (MC) data model

- **MC question**: an individual `Exercise` / `ExerciseRecord` (`question_type: mc|sc|tf`, `correct_answers` JSON / `options` & `correctAnswers` arrays, `penalty`). Variants use the standard `exercise_group_id` + `variant_key`.
- **MC group (`\McExercise{a}{b}{c}`)**: a per-exam layout container (`ExamMcGroup` / `ExamMcGroupRecord`, 1+ sub-items, no cap on count or size) linking members via `ExamExercise.mc_group_id` and `sub_index`. Rendered into one `\begin{Aufgabe}` by `format_mc_group_latex()`. An exercise belongs to at most one group (staging rules: `lib/exam/mcGroupStaging.ts`, shared by `exam/new` and `exam/[id]`).
- **Grading and statistics are strictly per question (`exerciseId`)**; `ExamMcGroup` is only LaTeX layout metadata.
- **Group membership lives on the junction row**, not on the exercise: `ExamExercise.mc_group_id`/`sub_index` server-side, `examExercises.mcGroupId`/`subIndex` in Dexie. The Dexie primary key is `[examId+exerciseId]`, so **any `examExercises.put`/`bulkPut` that omits those two fields silently dissolves the group** (it renders empty and its members reappear as standalone exercises). Always merge onto the stored record or carry the fields through from the API response.
- Group ids are **client-chosen and stable**; `_persist_mc_groups` keeps them and answers 409 on collision. `exam_exercises.mc_group_id` is `ON DELETE SET NULL`: dissolving a group must never delete its members' exam links.
- `PATCH /exams/{id}` replaces `mc_groups` and `exercise_links` wholesale. An exercise may appear **once** in `exercise_links` (`(exam_id, exercise_id)` is the primary key). `buildExamLinkPayload()` in `exam/[id]/+page.svelte` is the single builder for both the Dexie records and that payload; don't hand-roll a second one.
- Past 26 members the sub-label switches from `a)` to `1)`: `mcSubLabel` (`lib/grading/mcGroupLabels.ts`) and both group formatters must agree. An MC question's option column count lives only in its LaTeX body as `\LoesungMulti[N]` (`lib/latex/mcOptions.ts`).
- `examItems` (the exam page's item order) is view state, rebuilt on load from persisted `order_index` via `buildExamItems()`. Group members share their group's `order_index`.
- OMR detection internals: `docs/dev/omr.md`. Training-data donation: `docs/dev/training_donation.md`.

## LaTeX resource files

Teacher-uploaded files an exercise's LaTeX references (`\includegraphics{figure.png}`, `\input{data.tex}`). Any type except SVG (refused with a convert-to-PDF hint: `src/lib/latex/resources.ts`, mirrored in `backend/app/services/latex_resources.py`; keep the two in sync).

- Attached **per exercise**, referenced by **flat sanitized filename**; files are written next to `main.tex` in both engines, never in a subdirectory. Names that collide with a bundled `latex-assets` file (including the worker's flattened `sty/x.sty` → `x.sty`) are rejected at upload.
- Limits: 5 MB per file, 25 MB per exercise, 20 MB / 30 files per compile request; `BODY_LIMIT_COMPILE` 28 MB, `BODY_LIMIT_RESOURCE` 7 MB.
- Storage: Dexie `exerciseResources`, bytes AES-256-GCM encrypted; server table `exercise_resources`, bytes **plaintext** (same as `exercises.latex_body`; Tectonic cannot read ciphertext).
- The editor stages files under a throwaway id (never the exercise id) and `exerciseResourceRepository.commit()` moves the staged set onto the exercise on save. Cancel discards. The staged set is authoritative on commit: files removed while editing are deleted server-side too.
- Local compile: `compiler.ts` → worker `additionalFiles`. Server compile sends `resource_exercise_ids` for saved exercises and inline base64 only for staged/local-only files. `POST /exams/{id}/compile` always reads rows from the DB.
- Two exercises with *different* files under the same name is a hard error before compiling (`mergeResources`); identical bytes are deduped.
- Resource API calls pass `silentError` and report in the panel; a 404 for an exercise the server has never seen must not raise the global toast.
- A missing graphic does not fail XeLaTeX. The worker reports `missingGraphics` and callers surface it; a successful compile is not proof the figures rendered.
- busytex local-compile quirks (`compiler.ts` / `compiler.worker.ts`): (1) the first-ever local compile in a cold browser can throw spurious `File 'X.sty' not found` (e.g. `ulem.sty`) while `texlive-extra` downloads; it self-resolves on retry. (2) Local WASM compiles can silently drop exercise content that compiles on the server, because the worker only reports failure when the engine reports `!success`. Root cause unknown; needs the browser console log of a local compile.

## Gotchas

- **A swallowed API error still opens the global HTTP error modal.** `api.*` calls `httpErrorStore.showError()` before throwing. Pass `silentError: true` on anything with a local fallback, an offline-queue fallback, or an expected 409.
- **Never re-encrypt a record that failed to decrypt.** `decryptX()` marks it (`decryptFailed: 'error' | 'locked'`, `lib/db/decryptGuard.ts`) and every `encryptX()` calls `assertEncryptable()` first, which throws. The old helpers returned a *blank* record on failure and the next save sealed the blanks over the real payload. `encryptX(rec, null)` throws for the same reason.
- **Routes must `await awaitSessionReady()` before touching the vault.** Svelte 4 mounts children before the parent, so a route's `onMount` runs before `+layout.svelte` restores keys; without the gate the key is `null` on every F5.
- **Per-exercise scores go through `scoreRepository`**, never `db.exerciseScores` directly (the direct writes had no storage-mode branch, so `all-server` grading lived only in IndexedDB and was wiped on the idle timeout). The bulk write is a `PUT` keyed on `(submission_id, exercise_id)`, idempotent and safe to replay from the offline queue. There is deliberately **no plaintext `score` column**: the client seals score, `selectedOptions` and `omrMeta` into one payload.
- **Grading views must never clear an OMR-read MC score row.** The grade page's "score 0 + no strokes → ungraded" coercion and the manual grids' "empty input → `deleteOne`" used to delete rows carrying `omrMeta`, dropping the question from the MC verification queue. Outside the verify view, MC grading is optional: skip, or carry `selectedOptions`/`omrMeta` forward. The unsaved-changes prompt keys on `gradingStore.isDirty`, not on "strokes exist".
- **Map exercise API payloads only through `mapApiToExerciseRecord`** (`lib/repositories/exerciseRepository.ts`). Hand-rolled field lists dropped `variantKey`/`exerciseGroupId`/`isCurrent`, and the stripped record was `bulkPut` over the full one.
- **Import never writes before it has decrypted and resolved conflicts.** `decryptArchive()` touches nothing; `applyArchive()` writes under the **live** session key. Do not reintroduce a wipe before validation, and do not call `sessionStore.unlock()` with the archive key (the vault cannot re-derive it, so everything written afterwards dies with the tab).
- **`POST /auth/refresh` rotates the refresh token and treats a second use of a revoked one as theft**, revoking every session. `lib/api/client.ts` therefore deduplicates concurrent refreshes and, for `REFRESH_GRACE_MS` after a successful one, retries a 401 instead of refreshing again. Do not remove either guard.
- **`POST /exams` and `POST /exercises` are create-only** (a known id answers 409). Re-queuing that POST can never succeed; use `PATCH`.
- **An absent `annotation_ciphertext_b64` means "don't touch", not "delete".** Deleting needs `clear_annotations: true`.
