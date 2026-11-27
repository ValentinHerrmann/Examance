<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { get } from "svelte/store";
  import type { ExerciseRecord } from "#lib/db/schema";
  import { sessionStore } from "#lib/stores/session";
  import { effectiveLatexStore } from "#lib/stores/capabilities";
  import { askToShare } from "#lib/exercise-library/askToShare";
  import { parseExerciseScore } from "#lib/latex/scoreParser";
  import type { McOption } from "#lib/latex/mcOptions";
  import { McDraft } from "#lib/exercise-library/mcDraft.svelte";
  import { exerciseDraftError, rememberDraftSuggestions, type ExerciseDraft } from "#lib/exercise-library/exerciseEditorSave";
  import { httpErrorStore } from "#lib/stores/httpErrorStore";
  import { EditorSession } from "#lib/exercise-library/editorSession.svelte";
  import { EditorPreview } from "#lib/exercise-library/editorPreview.svelte";
  import CompileErrorHelp from "#lib/components/latex/CompileErrorHelp.svelte";
  import TemplateTextTip from "#lib/components/latex/TemplateTextTip.svelte";
  import { exerciseResourceRepository } from "#lib/repositories/exerciseResourceRepository";
  import ExerciseResourcePanel from "#lib/components/exercise/ExerciseResourcePanel.svelte";
  import ExerciseStructureModal from "#lib/components/exercise/ExerciseStructureModal.svelte";
  import ExerciseMetaFields from "#lib/components/exercise/ExerciseMetaFields.svelte";
  import McOptionsEditor from "#lib/components/exercise/McOptionsEditor.svelte";
  import ExercisePromptDialog from "#lib/components/exercise/ExercisePromptDialog.svelte";
  import { fmt } from "#lib/utils/format";
  import ExercisePackagesPanel from "#lib/components/latex-packages/ExercisePackagesPanel.svelte";
  import LatexEditor from "./LatexEditor.svelte";
  import DualPdfPreview from "./DualPdfPreview.svelte";
  import { createDirtyClose } from "#lib/utils/dirtyClose.svelte";
  import { t, translate } from "#lib/i18n";
  import LayoutReportButton from "#lib/components/layout-report/LayoutReportButton.svelte";
  import { exerciseReportFiles } from "#lib/layout-report/collect";
  import { ConfirmDialog, Alert, Badge, Button, Icon, Modal, SaveStatus } from "#lib/components/ui";
  import { faChevronDown, faChevronLeft, faChevronRight, faCode, faWandMagicSparkles } from "@fortawesome/free-solid-svg-icons";

  interface Props {
    isOpen?: boolean;
    editingExercise?: ExerciseRecord | null;
    isCreatingVersion?: boolean;
    versionBaseEx?: ExerciseRecord | null;
    onClose?: () => void;
    onSave?: (detail: { exercise: ExerciseRecord; isNewVersion: boolean }) => void;
    /** Where the cursor starts once the editor shows (a click in the exam preview, issue #347). */
    initialCursor?: { line: number; column: number } | null;
  }

  let {
    isOpen = false,
    editingExercise = null,
    isCreatingVersion = false,
    versionBaseEx = null,
    onClose,
    onSave,
    initialCursor = null
  }: Props = $props();

  // Form field state
  let editorName = $state("");
  let editorTopicTag = $state("_General");
  let editorGrade = $state("");
  let editorSubject = $state("");
  let editorVariantKey = $state("");
  let editorLatexBody = $state("");
  let editorQuestionType: "free_text" | "mc" = $state("free_text");
  const mc = new McDraft();
  /** Points deducted per wrongly-crossed MC option (right-minus-wrong scoring). Matches the printed scoring text convention. */
  let editorPenalty = $state(0.5);

  // The form as opened, for dirty tracking.
  let initial: ExerciseDraft = $state.raw(currentDraft());

  let baseRecord = $derived(isCreatingVersion ? versionBaseEx : editingExercise);
  const preview = new EditorPreview();
  let latexEditor: LatexEditor | undefined = $state();
  let showLatexPanel = $state(true);
  let structureOpen = $state(false);
  // AI-chat prompt (issue #168); the request survives closing the dialog while the editor stays open.
  let aiPromptOpen = $state(false);
  let aiPromptTask = $state("");
  /** MC: the composed LaTeX repeats question and options, so it opens on demand instead of inline. */
  let latexSourceOpen = $state(false);
  /** Phones: the metadata fields fold into a one-line summary so the code editor gets the screen. */
  let showMetaFields = $state(false);
  let isSaving = $state(false);
  let errorMsg = $state("");

  function insertResourceSnippet(snippet: string) {
    if (!isMc || mc.malformed) {
      editorLatexBody = `${editorLatexBody}\n${snippet}\n`;
      if (mc.malformed) syncMcStateFromLatex();
      return;
    }
    // MC: into the question, above the answer boxes.
    mc.questionText = `${mc.questionText}\n${snippet}`;
    regenerateMcLatex();
  }

  let title = $derived.by(() => {
    if (isCreatingVersion) return $t("exercises.editor.titleNewVersion", { name: editorName });
    return editingExercise ? $t("exercises.editor.titleEdit", { name: editorName }) : $t("exercises.editor.titleCreate");
  });
  let saveLabel = $derived.by(() => {
    if (isSaving) return $t("exercises.editor.saveButtonSaving");
    return isCreatingVersion ? $t("exercises.editor.saveButtonNewVersion") : $t("exercises.editor.saveButton");
  });
  let isMc = $derived(editorQuestionType !== "free_text");

  // Track initialization on isOpen or exercise props change
  let lastOpenState = $state(false);

  function initForm() {
    const source = baseRecord;
    aiPromptTask = "";
    aiPromptOpen = false;
    if (source) {
      editorName = source.name || translate("exercises.untitled");
      editorTopicTag = source.topicTag || "_General";
      editorGrade = source.grade || "";
      editorSubject = source.subject || "";
      editorVariantKey = source.variantKey || "";
      editorLatexBody = source.latexBody || "";
      editorQuestionType = source.questionType === "mc" ? "mc" : "free_text";
      editorPenalty = source.penalty || 0.5;
    } else {
      editorName = "New_Exercise";
      editorTopicTag = "_General";
      editorGrade = "";
      editorSubject = "";
      editorVariantKey = "";
      editorLatexBody = "Frage hier eingeben...";
      editorQuestionType = "free_text";
      editorPenalty = 0.5;
    }

    initial = currentDraft();
    filesRev = 0;
    session.start(source, editKey);
    dirtyClose.cancel();
    latexSourceOpen = false;
    errorMsg = "";
    syncMcStateFromLatex();

    preview.restore(editingExercise?.id);
  }

  function syncMcStateFromLatex(latex: string = editorLatexBody) {
    mc.syncFrom(latex);
  }

  function regenerateMcLatex() {
    editorLatexBody = mc.rebuild(editorLatexBody) ?? editorLatexBody;
  }

  function handleLatexBodyEdit(latex: string) {
    syncMcStateFromLatex(latex);
    preview.typed(latex, latexEditor?.getCursor());
  }

  function handleStructureChange(latex: string) {
    editorLatexBody = latex;
    if (isMc) syncMcStateFromLatex();
  }

  function handleQuestionTypeChange(type: "free_text" | "mc") {
    editorQuestionType = type;
    if (isMc && mc.start()) regenerateMcLatex();
  }

  function setMcOptions(options: McOption[]) {
    mc.options = options;
    regenerateMcLatex();
  }

  onDestroy(() => preview.cleanup());

  let isDirty = $derived(
    (editingExercise || isCreatingVersion
      ? false
      : editorName !== initial.name ||
        editorTopicTag !== initial.topicTag ||
        editorGrade !== initial.grade ||
        editorSubject !== initial.subject) ||
    editorVariantKey !== initial.variantKey ||
    editorLatexBody !== initial.latexBody ||
    editorQuestionType !== initial.questionType ||
    (isMc && editorPenalty !== initial.penalty)
  );

  const dirtyClose = createDirtyClose({
    isDirty: () => (autosaving ? editKey !== session.savedKey : isDirty),
    onClose: () => {
      preview.cleanup();
      // Staged files belong to the dialog, not to the library: a commit copied them (autosave) or moved them (explicit save); what is left goes with it.
      const stagingId = session.stagingId;
      if (stagingId && (autosaving || !session.resourcesCommitted)) {
        void exerciseResourceRepository.deleteForExercise(stagingId);
      }
      if (autosaving) void session.finish();
      onClose?.();
    },
  });

  async function runPreview(live: boolean) {
    if (!live) errorMsg = "";
    const message = await preview.compile({
      cacheId: editingExercise?.id || session.stagingId,
      name: editorName,
      latexBody: editorLatexBody,
      resourceOwnerId: session.stagingId,
      staged: true,
      useLocal: $effectiveLatexStore === "local",
      key: get(sessionStore).sessionKey,
    });
    errorMsg = preview.errorLine(errorMsg, message);
  }


  function currentDraft(): ExerciseDraft {
    return {
      name: editorName,
      topicTag: editorTopicTag,
      grade: editorGrade,
      subject: editorSubject,
      variantKey: editorVariantKey,
      latexBody: editorLatexBody,
      questionType: editorQuestionType,
      penalty: editorPenalty,
    };
  }

  // Editing an existing exercise saves itself (issue #232); a new exercise and a new version keep the explicit button.
  let autosaving = $derived(!!editingExercise && !isCreatingVersion && !editingExercise.codeWithheld);
  // Bumped by the file panel, so a file change alone schedules a save.
  let filesRev = $state(0);
  let editKey = $derived(JSON.stringify([editorName, editorTopicTag, editorGrade, editorSubject, editorVariantKey, editorLatexBody, editorQuestionType, isMc ? editorPenalty : null, filesRev]));
  let closing = $state(false);
  const session = new EditorSession({
    isOpen: () => isOpen,
    editing: () => editingExercise,
    editKey: () => editKey,
    draft: currentDraft,
    onSave: (detail) => onSave?.(detail),
    rememberSuggestions: () => rememberDraftSuggestions(currentDraft()),
  });
  const autosave = session.autosave;

  // Leaving the page with the editor open still saves what was typed, then finishes the session.
  onDestroy(() => {
    if (!autosaving || !isOpen || session.finished) return;
    const stagingId = session.stagingId;
    void autosave.flush().then(async () => {
      await session.finish();
      await exerciseResourceRepository.deleteForExercise(stagingId);
    });
  });

  /** Close of an autosaving editor: save what is pending (twice: edits typed during the group copy), then close; an edit that cannot be saved asks first. */
  async function closeEditing() {
    if (closing) return;
    closing = true;
    try {
      await autosave.flush();
      await session.runPendingCascade();
      await autosave.flush();
      if (editKey !== session.savedKey) dirtyClose.request();
      else dirtyClose.force();
    } finally {
      closing = false;
    }
  }

  function requestClose() {
    if (autosaving) void closeEditing();
    else dirtyClose.request();
  }

  async function handleSaveExercise() {
    // Imported without code: there is nothing to edit, and a save would turn the exercise into an empty one.
    if (editingExercise?.codeWithheld) {
      errorMsg = translate("exam.resultsOnly.noEdit");
      return;
    }
    const draft = currentDraft();
    if (isMc) syncMcStateFromLatex();
    const invalid = exerciseDraftError(draft);
    if (invalid) {
      errorMsg = translate(invalid);
      return;
    }

    rememberDraftSuggestions(draft);

    isSaving = true;
    errorMsg = "";
    const key = get(sessionStore).sessionKey;

    try {
      const saved = await session.save(draft, isCreatingVersion ? versionBaseEx : null, key);
      onSave?.(saved);
      // After the editor's own save, so the question never holds it up (issue #263).
      void askToShare(saved.exercise.id);
      dirtyClose.force();
    } catch (err) {
      errorMsg = translate("exercises.editor.saveFailed", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      isSaving = false;
    }
  }

  // Below `@3xl` the column takes its natural height inside the body's scroller; from `@3xl` it fills its half and scrolls on its own.
  const editorColumnBase =
    "flex flex-col shrink-0 rounded-md border border-line bg-surface-sunken transition-all duration-200 @3xl:h-full @3xl:min-h-0 @3xl:overflow-hidden";
  let editorColumnClass = $derived(showLatexPanel
    ? `${editorColumnBase} min-w-0 p-0 gap-0 @3xl:flex-1 @3xl:shrink`
    : `${editorColumnBase} w-full h-10 flex-none min-w-0 p-0 overflow-hidden @3xl:w-10 @3xl:min-w-10`);

  $effect.pre(() => {
    const open = isOpen;
    const last = lastOpenState;
    untrack(() => {
      if (open && !last) {
        initForm();
        lastOpenState = true;
      } else if (!open && last) {
        lastOpenState = false;
        preview.cleanup();
      }
    });
  });

  // Every edit of an existing exercise schedules a save.
  $effect.pre(() => {
    const key = editKey;
    const on = isOpen && autosaving;
    untrack(() => {
      if (on && key !== session.savedKey) autosave.schedule();
    });
  });

  // Live preview (browser engine only; a server compile is a background job): text and file edits recompile once this session compiled or shows a PDF.
  $effect.pre(() => {
    const key = JSON.stringify([editorName, editorLatexBody, filesRev]);
    const on = isOpen && $effectiveLatexStore === "local" && (preview.compiled || !!preview.pdfUrl);
    untrack(() => preview.live(key, on, () => void runPreview(true)));
  });

  // Once per opening, as soon as the code editor exists.
  let cursorPlaced = false;
  $effect.pre(() => {
    const ed = latexEditor;
    const open = isOpen;
    untrack(() => {
      if (!open) cursorPlaced = false;
      else if (ed && initialCursor && !cursorPlaced) {
        cursorPlaced = true;
        requestAnimationFrame(() => ed.setCursor(initialCursor.line, initialCursor.column));
      }
    });
  });
</script>

{#snippet layoutReport()}
  <LayoutReportButton
    compact
    kind="exercise"
    title={editorName}
    compileError={preview.error || null}
    disabled={preview.loading}
    collectFiles={() =>
      exerciseReportFiles(
        {
          name: editorName,
          latexBody: editorLatexBody,
          resourceOwnerId: session.stagingId,
          staged: true,
          key: get(sessionStore).sessionKey,
        },
        preview.pdfUrl,
        preview.solutionUrl
      )}
  />
{/snippet}

{#if isOpen}
  <Modal open={isOpen} size="full" tall bare onClose={requestClose} labelledBy="exercise-editor-title">
    {#snippet header()}
      <!-- Metadata sits in the header: beside the title from @6xl, below it down to @3xl, folded on phones. -->
      <div class="flex min-w-0 flex-col gap-2 @6xl:flex-row @6xl:items-center @6xl:gap-4">
        <div class="flex min-w-0 items-center gap-2 @6xl:max-w-sm @6xl:shrink-0">
          <h2 id="exercise-editor-title" class="m-0 truncate text-xl font-semibold text-content">{title}</h2>
          {#if isCreatingVersion}
            <Badge severity="primary">v{(versionBaseEx?.version || 1) + 1}</Badge>
          {/if}
        </div>
        <button
          type="button"
          class="flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md border border-line bg-surface-sunken px-3 py-2 text-left text-sm @3xl:hidden"
          aria-expanded={showMetaFields}
          onclick={() => (showMetaFields = !showMetaFields)}
        >
          <Icon icon={showMetaFields ? faChevronDown : faChevronRight} class="shrink-0 text-muted" />
          <span class="min-w-0 flex-1 truncate">
            <strong class="font-semibold text-content">{editorName || $t("exercises.untitled")}</strong>
            <span class="text-muted"> · {editorTopicTag}</span>
          </span>
          <span class="shrink-0 text-xs text-accent">{$t("exercises.editor.metaToggle")}</span>
        </button>
        <div class="{showMetaFields ? 'block' : 'hidden'} min-w-0 @3xl:block @6xl:flex-1">
          <ExerciseMetaFields
            bind:name={editorName}
            bind:topicTag={editorTopicTag}
            bind:grade={editorGrade}
            bind:subject={editorSubject}
            bind:variantKey={editorVariantKey}
            questionType={editorQuestionType}
            existing={!!(editingExercise || isCreatingVersion)}
            onQuestionTypeChange={handleQuestionTypeChange}
          />
        </div>
      </div>
    {/snippet}

    <div class="flex w-full flex-col border-t border-line @3xl:h-full @3xl:max-h-full @3xl:overflow-hidden">
      {#if errorMsg}
        <Alert severity="danger" class="mx-4 mt-3 shrink-0">
          <div class="max-h-52 overflow-y-auto whitespace-pre-wrap break-all font-mono">{errorMsg}</div>
          {#if preview.log && errorMsg === preview.error}<CompileErrorHelp failure={preview.log} class="mt-2" />{/if}
        </Alert>
      {/if}

      <!-- Below @3xl the modal body is the one scroller (natural height, no nested pane); from @3xl two fixed columns. -->
      <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 @3xl:flex-row @3xl:gap-3 @3xl:overflow-hidden @3xl:p-3">
        <div class={editorColumnClass}>
          {#if showLatexPanel}
            <div class="flex w-full shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-raised px-3 py-2">
              <button
                type="button"
                class="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
                onclick={() => (showLatexPanel = !showLatexPanel)}
                title={$t("exercises.editor.collapseLatexTitle")}
              >
                <span class="truncate text-sm font-semibold text-content">
                  {isMc ? $t("exercises.editor.mcButton") : $t("exercises.editor.latexSourceCodeLabel")}
                </span>
                <Icon icon={faChevronRight} class="shrink-0 text-muted group-hover:text-accent" />
              </button>
              {#if isMc}
                <Button size="sm" variant="outlined" severity="secondary" icon={faCode} onClick={() => (latexSourceOpen = true)} title={$t("exercises.editor.showLatexButton")}>
                  <span class="hidden @3xl:inline">{$t("exercises.editor.showLatexButton")}</span>
                </Button>
              {/if}
              <Button
                size="sm"
                variant="outlined"
                severity="secondary"
                onClick={() => (structureOpen = true)}
                title={$t("exercises.structure.openTitle")}
              >
                <span class="hidden @3xl:inline">{$t("exercises.structure.title")}</span>
                <Badge severity="primary" size="xs">{$t("exercises.structure.scoreBadge", { score: $fmt.number(parseExerciseScore(editorLatexBody)) })}</Badge>
              </Button>
              <Button
                size="sm"
                variant="outlined"
                severity="secondary"
                icon={faWandMagicSparkles}
                onClick={() => (aiPromptOpen = true)}
                title={$t("exercises.aiPrompt.buttonTitle")}
              >
                <span class="hidden @3xl:inline">{$t("exercises.aiPrompt.button")}</span>
              </Button>
              <Button
                size="sm"
                onClick={() => runPreview(false)}
                disabled={preview.loading}
                title={$t("exercises.editor.previewButtonTitle")}
              >{preview.loading ? $t("exercises.editor.previewButtonLoading") : $t("exercises.editor.previewButton")}</Button>
            </div>

            <div class="flex flex-col gap-2 p-2 @3xl:min-h-0 @3xl:flex-1 @3xl:overflow-y-auto">
              {#if isMc}
                <McOptionsEditor
                  bind:questionText={mc.questionText}
                  bind:columns={mc.columns}
                  bind:penalty={editorPenalty}
                  options={mc.options}
                  malformed={mc.malformed}
                  onChange={regenerateMcLatex}
                  onOptionsChange={setMcOptions}
                  onShowLatex={() => (latexSourceOpen = true)}
                />
              {:else}
                <!-- From @3xl the code area absorbs all free space; no explicit min-height, so its minimum stays palette + code rows and it never paints over the panels (issue #188). -->
                <div class="flex flex-col @3xl:flex-1">
                  <LatexEditor bind:this={latexEditor} bind:value={editorLatexBody} rows={12} showQuickInsert onChange={handleLatexBodyEdit} />
                </div>
              {/if}

              <div class="grid shrink-0 items-start gap-2 @3xl:grid-cols-2">
                <ExerciseResourcePanel
                  exerciseId={session.stagingId}
                  seeded={session.seeded}
                  onInsert={insertResourceSnippet}
                  onChange={() => filesRev++}
                />
                <ExercisePackagesPanel
                  bind:latex={() => editorLatexBody, (v) => { editorLatexBody = v; handleLatexBodyEdit(v); }}
                  name={editorName}
                />
              </div>
            </div>
          {:else}
            <button
              type="button"
              class="group flex h-full w-full cursor-pointer flex-row items-center gap-3 border-0 bg-surface-sunken px-3 py-1 text-muted hover:bg-surface-raised hover:text-accent @3xl:flex-col @3xl:px-1 @3xl:py-3"
              onclick={() => (showLatexPanel = !showLatexPanel)}
              title={$t("exercises.editor.expandLatexTitle")}
            >
              <Icon icon={faChevronLeft} class="shrink-0 -rotate-90 @3xl:rotate-180" />
              <Icon icon={faCode} class="shrink-0 text-base" />
              <span
                class="whitespace-nowrap text-xs font-semibold @3xl:[writing-mode:vertical-rl] @3xl:rotate-180"
              >{$t("exercises.editor.latexPanelCollapsedLabel", { score: parseExerciseScore(editorLatexBody) })}</span>
            </button>
          {/if}
        </div>

        <DualPdfPreview
          previewPdfUrl={preview.pdfUrl}
          previewSolutionPdfUrl={preview.solutionUrl}
          bind:showAngabePreview={preview.showAngabe}
          bind:showLoesungPreview={preview.showLoesung}
          titleAngabe={$t("exercises.editor.previewAngabeTitle")}
          titleLoesung={$t("exercises.editor.previewLoesungTitle")}
          placeholderText={$t("exercises.editor.previewPlaceholder")}
          shrinkWhenCollapsed={showLatexPanel}
          report={preview.pdfUrl || preview.solutionUrl || preview.error ? layoutReport : undefined}
          overlays={preview.sync.overlays}
          onPageClick={(pane, click) => void preview.jump(pane, click, editorLatexBody, isMc ? undefined : latexEditor)}
        />
        <TemplateTextTip sync={preview.sync} />
      </div>
    </div>

    {#snippet footer()}
      {#if autosaving}
        <SaveStatus status={$autosave} class="mr-auto" />
        <Button onClick={requestClose} loading={closing}>{$t("common.close")}</Button>
      {:else}
        <Button variant="outlined" severity="secondary" onClick={dirtyClose.request}>{$t("common.cancel")}</Button>
        <Button onClick={handleSaveExercise} disabled={isSaving || !!editingExercise?.codeWithheld}>
          {saveLabel}
        </Button>
      {/if}
    {/snippet}
  </Modal>
{/if}

{#if latexSourceOpen}
  <Modal open size="large" tall title={$t("exercises.editor.latexSourceCodeLabel")} onClose={() => (latexSourceOpen = false)}>
    <div class="flex h-full flex-col">
      <LatexEditor bind:value={editorLatexBody} rows={16} showQuickInsert onChange={handleLatexBodyEdit} />
    </div>
    {#snippet footer()}
      <Button variant="text" severity="secondary" onClick={() => (latexSourceOpen = false)}>{$t("common.close")}</Button>
    {/snippet}
  </Modal>
{/if}

{#if aiPromptOpen}
  <ExercisePromptDialog
    latexBody={editorLatexBody}
    meta={{ name: editorName, subject: editorSubject, grade: editorGrade, topic: editorTopicTag }}
    questionType={editorQuestionType}
    resourceStagingId={session.stagingId}
    seeded={session.seeded}
    bind:task={aiPromptTask}
    onClose={() => (aiPromptOpen = false)}
  />
{/if}

{#if structureOpen}
  <ExerciseStructureModal
    latex={editorLatexBody}
    {isMc}
    onChange={handleStructureChange}
    onClose={() => (structureOpen = false)}
  />
{/if}

<ConfirmDialog
  open={dirtyClose.confirming}
  title={$t("exercises.editor.discardTitle")}
  message={$t("exercises.editor.discardMessage")}
  confirmText={$t("exercises.confirmDiscard.confirmText")}
  cancelText={$t("exercises.confirmDiscard.cancelText")}
  severity="danger"
  role="dialog"
  onConfirm={dirtyClose.force}
  onCancel={dirtyClose.cancel}
/>
