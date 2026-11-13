<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { get } from "svelte/store";
  import type { ExerciseRecord } from "#lib/db/schema";
  import { sessionStore } from "#lib/stores/session";
  import { effectiveLatexStore } from "#lib/stores/capabilities";
  import { askToShare } from "#lib/exercise-library/askToShare";
  import { parseExerciseScore } from "#lib/latex/scoreParser";
  import { parseMcOptions, buildMcOptionsLatex, type McOption } from "#lib/latex/mcOptions";
  import { EDITOR_AUTOSAVE_MS, exerciseDraftError, withoutMetaTags, writeExercise, writeNewVersion, type ExerciseDraft } from "#lib/exercise-library/exerciseEditorSave";
  import { createAutosave } from "#lib/utils/autosave";
  import { getLatestForSlot } from "#lib/latex/compileCache";
  import { compileExercisePreview } from "#lib/latex/exercisePreview";
  import { pdfBytesToUrl } from "#lib/latex/pdfPreview";
  import { compileFailure, type CompileFailure } from "#lib/latex/compileError";
  import CompileErrorHelp from "#lib/components/latex/CompileErrorHelp.svelte";
  import { exerciseResourceRepository } from "#lib/repositories/exerciseResourceRepository";
  import ExerciseResourcePanel from "#lib/components/exercise/ExerciseResourcePanel.svelte";
  import ExerciseStructureModal from "#lib/components/exercise/ExerciseStructureModal.svelte";
  import ExerciseMetaFields from "#lib/components/exercise/ExerciseMetaFields.svelte";
  import McOptionsEditor from "#lib/components/exercise/McOptionsEditor.svelte";
  import ExercisePromptDialog from "#lib/components/exercise/ExercisePromptDialog.svelte";
  import { fmt } from "#lib/utils/format";
  import { parseExerciseStructure, setCompetencies, setRequirementLevel } from "#lib/latex/exerciseStructure";
  import ExercisePackagesPanel from "#lib/components/latex-packages/ExercisePackagesPanel.svelte";
  import LatexEditor from "./LatexEditor.svelte";
  import DualPdfPreview from "./DualPdfPreview.svelte";
  import { recordValue } from "#lib/utils/recentValues";
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
  }

  let {
    isOpen = false,
    editingExercise = null,
    isCreatingVersion = false,
    versionBaseEx = null,
    onClose,
    onSave
  }: Props = $props();

  // Form field state
  let editorName = $state("");
  let editorTopicTag = $state("_General");
  let editorGrade = $state("");
  let editorSubject = $state("");
  let editorVariantKey = $state("");
  let editorLatexBody = $state("");
  let editorQuestionType: "free_text" | "mc" = $state("free_text");
  let mcQuestionText = $state("");
  /** LaTeX after the \LoesungMulti block; kept as is when the MC editor rebuilds the body. */
  let mcTrailingText = $state("");
  /** The composed LaTeX has an unclosed \LoesungMulti block: the MC editor must not rebuild from it. */
  let mcBlockMalformed = $state(false);
  let mcOptions: McOption[] = $state.raw([]);
  /** Column layout of the options: "auto" (one per option) or an explicit count, as a <select> value. */
  let mcColumns = $state("auto");
  /** Points deducted per wrongly-crossed MC option (right-minus-wrong scoring). Matches the printed scoring text convention. */
  let editorPenalty = $state(0.5);

  // Initial state for dirty tracking
  let initialName = $state("");
  let initialTopicTag = $state("");
  let initialGrade = $state("");
  let initialSubject = $state("");
  let initialVariantKey = $state("");
  let initialLatexBody = $state("");
  let initialQuestionType: "free_text" | "mc" = $state("free_text");
  let initialPenalty = $state(0.5);

  let baseRecord = $derived(isCreatingVersion ? versionBaseEx : editingExercise);

  // Fresh staging id for resource files: lets upload/preview work before the exercise exists. Committed onto the real exercise on save; closing without saving discards the staged set.
  let resourceStagingId = $state("");
  let resourcesCommitted = false;
  // The staging area is filled asynchronously; the panel loads and commit runs only after it.
  let resourceSeed: Promise<void> = Promise.resolve();
  let resourcesSeeded = $state(false);

  // Preview state
  let isPreviewLoading = $state(false);
  let previewPdfUrl: string | null = $state(null);
  let previewSolutionPdfUrl: string | null = $state(null);
  // Both panes start collapsed: there is nothing to preview until the user compiles, so reserving half the dialog for an empty placeholder on open wastes space. Expanding either pane is still one click away.
  let showAngabePreview = $state(false);
  let showLoesungPreview = $state(false);
  let showLatexPanel = $state(true);
  let structureOpen = $state(false);
  // AI-chat prompt (issue #168); the request survives closing the dialog while the editor stays open.
  let aiPromptOpen = $state(false);
  let aiPromptTask = $state("");
  /** MC: the composed LaTeX repeats question and options, so it opens on demand instead of inline. */
  let latexSourceOpen = $state(false);
  /** Phones: the metadata fields fold into a one-line summary so the code editor gets the screen. */
  let showMetaFields = $state(false);
  let hasAnyPreview = $derived(showAngabePreview || showLoesungPreview);
  let isSaving = $state(false);
  let errorMsg = $state("");
  /** The last preview's failure (not save errors), sent with a layout report. */
  let previewError = $state("");
  let previewLog = $state<CompileFailure | null>(null);

  // Move the staged files onto the just-written exercise. Upload failures never fail the save: the exercise is already stored and the files stay staged locally.
  async function commitStagedResources(exerciseId: string, key: CryptoKey | null): Promise<boolean> {
    await resourceSeed;
    try {
      const { errors, changed } = await exerciseResourceRepository.commit(
        resourceStagingId,
        exerciseId,
        key
      );
      resourcesCommitted = true;
      if (errors.length > 0) {
        console.warn("Some resource files could not be synced:", errors);
      }
      return changed;
    } catch (err) {
      console.warn("Failed to store resource files:", err);
      return false;
    }
  }

  function insertResourceSnippet(snippet: string) {
    if (!isMc || mcBlockMalformed) {
      editorLatexBody = `${editorLatexBody}\n${snippet}\n`;
      if (mcBlockMalformed) syncMcStateFromLatex();
      return;
    }
    // MC: into the question, above the answer boxes.
    mcQuestionText = `${mcQuestionText}\n${snippet}`;
    regenerateMcLatex();
  }

  function handleToggleLatex() {
    showLatexPanel = !showLatexPanel;
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

    initialName = editorName;
    initialTopicTag = editorTopicTag;
    initialGrade = editorGrade;
    initialSubject = editorSubject;
    initialVariantKey = editorVariantKey;
    initialLatexBody = editorLatexBody;
    initialQuestionType = editorQuestionType;
    initialPenalty = editorPenalty;
    savedRecord = null;
    savedKey = editKey;
    // Seed the staging area from whichever exercise is being edited or versioned; a new version therefore starts with the base version's figures without ever writing back to it.
    const stagingId = crypto.randomUUID();
    resourceStagingId = stagingId;
    resourcesCommitted = false;
    resourcesSeeded = false;
    resourceSeed = source?.id
      ? exerciseResourceRepository
          .seedStaging(source.id, stagingId, get(sessionStore).sessionKey)
          .catch(() => {})
      : Promise.resolve();
    void resourceSeed.then(() => {
      if (resourceStagingId === stagingId) resourcesSeeded = true;
    });
    showAngabePreview = false;
    showLoesungPreview = false;
    dirtyClose.cancel();
    latexSourceOpen = false;
    errorMsg = "";
    syncMcStateFromLatex();

    cleanupPreview();
    if (editingExercise?.id) {
      const cachedAngabe = getLatestForSlot({ kind: "exercise", id: editingExercise.id, variant: "angabe" });
      if (cachedAngabe) {
        const blobAngabe = new Blob([cachedAngabe.pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
        previewPdfUrl = URL.createObjectURL(blobAngabe);
      }
      const cachedLoesung = getLatestForSlot({ kind: "exercise", id: editingExercise.id, variant: "loesung" });
      if (cachedLoesung) {
        const blobLoesung = new Blob([cachedLoesung.pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
        previewSolutionPdfUrl = URL.createObjectURL(blobLoesung);
      }
    }
  }

  function syncMcStateFromLatex(latex: string = editorLatexBody) {
    const parsed = parseMcOptions(withoutMetaTags(latex));
    mcQuestionText = parsed.questionText;
    mcTrailingText = parsed.trailingText;
    mcBlockMalformed = parsed.malformed;
    mcOptions = parsed.options;
    mcColumns = parsed.columns === null ? "auto" : String(parsed.columns);
  }

  function regenerateMcLatex() {
    if (mcBlockMalformed) return;
    const meta = parseExerciseStructure(editorLatexBody);
    const body = buildMcOptionsLatex(
      mcQuestionText,
      mcOptions,
      mcColumns === "auto" ? null : Number(mcColumns),
      mcTrailingText,
    );
    editorLatexBody = setCompetencies(setRequirementLevel(body, meta.levels[0] ?? null), meta.competencies);
  }

  // Typing in the composed LaTeX updates the MC editor (also in free-text mode, for a later switch), so its next change rebuilds from this text.
  function handleLatexBodyEdit(latex: string) {
    syncMcStateFromLatex(latex);
  }

  function handleStructureChange(latex: string) {
    editorLatexBody = latex;
    if (isMc) syncMcStateFromLatex();
  }

  function handleQuestionTypeChange(type: "free_text" | "mc") {
    editorQuestionType = type;
    if (isMc && mcOptions.length === 0) {
      mcQuestionText = mcQuestionText.trim() || "Frage hier eingeben...";
      mcOptions = [
        { text: "", correct: false },
        { text: "", correct: false },
      ];
      regenerateMcLatex();
    }
  }

  function setMcOptions(options: McOption[]) {
    mcOptions = options;
    regenerateMcLatex();
  }

  function cleanupPreview() {
    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
      previewPdfUrl = null;
    }
    if (previewSolutionPdfUrl) {
      URL.revokeObjectURL(previewSolutionPdfUrl);
      previewSolutionPdfUrl = null;
    }
  }

  onDestroy(() => {
    cleanupPreview();
  });

  let isDirty = $derived(
    (editingExercise || isCreatingVersion
      ? false
      : editorName !== initialName ||
        editorTopicTag !== initialTopicTag ||
        editorGrade !== initialGrade ||
        editorSubject !== initialSubject) ||
    editorVariantKey !== initialVariantKey ||
    editorLatexBody !== initialLatexBody ||
    editorQuestionType !== initialQuestionType ||
    (isMc && editorPenalty !== initialPenalty)
  );

  const dirtyClose = createDirtyClose({
    isDirty: () => (autosaving ? editKey !== savedKey : isDirty),
    onClose: () => {
      cleanupPreview();
      // Staged files belong to the dialog, not to the library: unless they were committed by a save, they go with it.
      if (!resourcesCommitted && resourceStagingId) {
        void exerciseResourceRepository.deleteForExercise(resourceStagingId);
      }
      onClose?.();
    },
  });

  async function handlePreviewExercise() {
    isPreviewLoading = true;
    errorMsg = "";
    previewError = "";
    previewLog = null;
    let angabeShown = false;
    try {
      const res = await compileExercisePreview({
        cacheId: editingExercise?.id || resourceStagingId,
        name: editorName,
        latexBody: editorLatexBody,
        resourceOwnerId: resourceStagingId,
        staged: true,
        useLocal: $effectiveLatexStore === "local",
        key: get(sessionStore).sessionKey,
        onAngabe: (angabe) => {
          if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
          previewPdfUrl = pdfBytesToUrl(angabe.pdfBytes);
          angabeShown = true;
          showAngabePreview = true;
        }
      });
      if (!angabeShown) {
        if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
        previewPdfUrl = pdfBytesToUrl(res.angabe.pdfBytes);
      }
      if (previewSolutionPdfUrl) URL.revokeObjectURL(previewSolutionPdfUrl);
      previewSolutionPdfUrl = pdfBytesToUrl(res.loesung.pdfBytes);

      // Panes start collapsed (nothing to show); now that a PDF exists, open the exam pane so the compile result is actually visible.
      showAngabePreview = true;

      // A missing figure does not fail the engine — say so instead of handing back a PDF with a silent hole in it.
      if (res.missingGraphics.length > 0) {
        errorMsg = translate("common.previewMissingGraphic", { name: res.missingGraphics[0] });
      }
    } catch (err) {
      console.error("Exercise preview failed:", err);
      const message = err instanceof Error && err.message ? err.message : translate("exercises.editor.previewFailedUnknown");
      errorMsg = translate("exercises.editor.previewFailed", { message });
      previewError = errorMsg;
      previewLog = compileFailure(err);
    } finally {
      isPreviewLoading = false;
    }
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

  function rememberSuggestions() {
    if (editorTopicTag) recordValue("exercise.topic", editorTopicTag);
    if (editorGrade) recordValue("exercise.grade", editorGrade);
    if (editorSubject) recordValue("exercise.subject", editorSubject);
  }

  // Editing an existing exercise saves itself (issue #232); a new exercise and a new version keep the explicit button.
  let autosaving = $derived(!!editingExercise && !isCreatingVersion && !editingExercise.codeWithheld);
  let editKey = $derived(JSON.stringify([editorName, editorTopicTag, editorGrade, editorSubject, editorVariantKey, editorLatexBody, editorQuestionType, isMc ? editorPenalty : null]));
  // The edit key of the last stored state, and the record that save wrote (null: nothing written since opening).
  let savedKey = $state("");
  let savedRecord: ExerciseRecord | null = null;

  async function autosaveRun() {
    const base = editingExercise;
    const key = editKey;
    if (!base || key === savedKey) return;
    const draft = currentDraft();
    const invalid = exerciseDraftError(draft);
    if (invalid) throw new Error(translate(invalid));
    // Sister exercises share the group metadata: copy it only when it changed, not on every LaTeX keystroke.
    const cascadeGroup =
      draft.name !== initialName || draft.topicTag !== initialTopicTag || draft.grade !== initialGrade || draft.subject !== initialSubject;
    savedRecord = await writeExercise(base, draft, { key: get(sessionStore).sessionKey, cascadeGroup });
    savedKey = key;
    initialName = draft.name;
    initialTopicTag = draft.topicTag;
    initialGrade = draft.grade;
    initialSubject = draft.subject;
    initialVariantKey = draft.variantKey;
    initialLatexBody = draft.latexBody;
    initialQuestionType = draft.questionType;
    initialPenalty = draft.penalty;
  }

  const autosave = createAutosave({
    run: autosaveRun,
    delayMs: EDITOR_AUTOSAVE_MS,
    message: (err) => (err instanceof Error ? err.message : String(err)),
  });
  onDestroy(() => autosave.dispose());

  /** Close of an autosaving editor: save what is pending, commit the files once, then tell the parent once. An edit that cannot be saved asks before it is dropped. */
  async function closeEditing() {
    await autosave.flush();
    if (editKey !== savedKey) {
      dirtyClose.request();
      return;
    }
    const exercise = savedRecord ?? editingExercise;
    if (!exercise) return dirtyClose.force();
    isSaving = true;
    try {
      const filesChanged = await commitStagedResources(exercise.id, get(sessionStore).sessionKey);
      if (savedRecord) rememberSuggestions();
      if (savedRecord || filesChanged) onSave?.({ exercise, isNewVersion: false });
      if (savedRecord) void askToShare(exercise.id);
    } finally {
      isSaving = false;
    }
    dirtyClose.force();
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

    rememberSuggestions();

    isSaving = true;
    errorMsg = "";
    const key = get(sessionStore).sessionKey;

    try {
      if (isCreatingVersion && versionBaseEx) {
        const savedEx = await writeNewVersion(versionBaseEx, draft, key);

        // A new version is a new exercise row; the staged set (the base version's files plus anything added here) becomes its file set.
        await commitStagedResources(savedEx.id, key);
        onSave?.({ exercise: savedEx, isNewVersion: true });
        // After the editor's own save, so the question never holds it up (issue #263).
        void askToShare(savedEx.id);
        dirtyClose.force();
        return;
      }

      const record = await writeExercise(editingExercise, draft, { key, cascadeGroup: true });
      await commitStagedResources(record.id, key);
      onSave?.({ exercise: record, isNewVersion: false });
      void askToShare(record.id);
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
        cleanupPreview();
      }
    });
  });

  // Every edit of an existing exercise schedules a save.
  $effect.pre(() => {
    const key = editKey;
    const on = isOpen && autosaving;
    untrack(() => {
      if (on && key !== savedKey) autosave.schedule();
    });
  });
</script>

{#snippet layoutReport()}
  <LayoutReportButton
    compact
    kind="exercise"
    title={editorName}
    compileError={previewError || null}
    disabled={isPreviewLoading}
    collectFiles={() =>
      exerciseReportFiles(
        {
          name: editorName,
          latexBody: editorLatexBody,
          resourceOwnerId: resourceStagingId,
          staged: true,
          key: get(sessionStore).sessionKey,
        },
        previewPdfUrl,
        previewSolutionPdfUrl
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
          {#if previewLog && errorMsg === previewError}<CompileErrorHelp failure={previewLog} class="mt-2" />{/if}
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
                onclick={handleToggleLatex}
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
                onClick={handlePreviewExercise}
                disabled={isPreviewLoading}
                title={$t("exercises.editor.previewButtonTitle")}
              >{isPreviewLoading ? $t("exercises.editor.previewButtonLoading") : $t("exercises.editor.previewButton")}</Button>
            </div>

            <div class="flex flex-col gap-2 p-2 @3xl:min-h-0 @3xl:flex-1 @3xl:overflow-y-auto">
              {#if isMc}
                <McOptionsEditor
                  bind:questionText={mcQuestionText}
                  bind:columns={mcColumns}
                  bind:penalty={editorPenalty}
                  options={mcOptions}
                  malformed={mcBlockMalformed}
                  onChange={regenerateMcLatex}
                  onOptionsChange={setMcOptions}
                  onShowLatex={() => (latexSourceOpen = true)}
                />
              {:else}
                <!-- From @3xl the code area absorbs all free space; no explicit min-height, so its minimum stays palette + code rows and it never paints over the panels (issue #188). -->
                <div class="flex flex-col @3xl:flex-1">
                  <LatexEditor bind:value={editorLatexBody} rows={12} showQuickInsert onChange={handleLatexBodyEdit} />
                </div>
              {/if}

              <div class="grid shrink-0 items-start gap-2 @3xl:grid-cols-2">
                <ExerciseResourcePanel
                  exerciseId={resourceStagingId}
                  seeded={resourcesSeeded}
                  onInsert={insertResourceSnippet}
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
              onclick={handleToggleLatex}
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
          {previewPdfUrl}
          {previewSolutionPdfUrl}
          bind:showAngabePreview
          bind:showLoesungPreview
          titleAngabe={$t("exercises.editor.previewAngabeTitle")}
          titleLoesung={$t("exercises.editor.previewLoesungTitle")}
          placeholderText={$t("exercises.editor.previewPlaceholder")}
          shrinkWhenCollapsed={showLatexPanel}
          report={previewPdfUrl || previewSolutionPdfUrl || previewError ? layoutReport : undefined}
        />
      </div>
    </div>

    {#snippet footer()}
      {#if autosaving}
        <SaveStatus status={$autosave} class="mr-auto" />
        <Button onClick={requestClose} loading={isSaving}>{$t("common.close")}</Button>
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
    resourceStagingId={resourceStagingId}
    seeded={resourcesSeeded}
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
