<script lang="ts">
  import { createEventDispatcher, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import type { ExerciseRecord } from "$lib/db/schema";
  import { db } from "$lib/db/db";
  import { sessionStore, isAuthenticated } from "$lib/stores/session";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import { saveExerciseEncrypted, loadExercisesEncrypted } from "$lib/db/dbEncryption";
  import { api } from "$lib/api/client";
  import { parseExerciseScore, formatExerciseLatex } from "$lib/latex/scoreParser";
  import { parseMcOptions, buildMcOptionsLatex, type McOption } from "$lib/latex/mcOptions";
  import { compileWithCache, getLatestForSlot } from "$lib/latex/compileCache";
  import { exerciseResourceRepository } from "$lib/repositories/exerciseResourceRepository";
  import ExerciseResourcePanel from "$lib/components/exercise/ExerciseResourcePanel.svelte";
  import LatexEditor from "./LatexEditor.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import DualPdfPreview from "./DualPdfPreview.svelte";
  import SuggestInput from "$lib/components/common/SuggestInput.svelte";
  import { recordValue } from "$lib/utils/recentValues";
  import { t, translate } from "$lib/i18n";
  import { Modal } from "$lib/components/ui";

  export let isOpen = false;
  export let editingExercise: ExerciseRecord | null = null;
  export let isCreatingVersion = false;
  export let versionBaseEx: ExerciseRecord | null = null;

  const dispatch = createEventDispatcher<{
    close: void;
    save: { exercise: ExerciseRecord; isNewVersion: boolean };
  }>();

  // Form field state
  let editorName = "";
  let editorTopicTag = "_General";
  let editorGrade = "";
  let editorSubject = "";
  let editorVariantKey = "";
  let editorLatexBody = "";
  let editorQuestionType: "free_text" | "mc" = "free_text";
  let mcQuestionText = "";
  let mcOptions: McOption[] = [];
  let mcOptionsError = "";
  /** Points deducted per wrongly-crossed MC option (right-minus-wrong scoring). Matches the printed scoring text convention. */
  let editorPenalty = 0.5;

  // Initial state for dirty tracking
  let initialName = "";
  let initialTopicTag = "";
  let initialGrade = "";
  let initialSubject = "";
  let initialVariantKey = "";
  let initialLatexBody = "";
  let initialQuestionType: "free_text" | "mc" = "free_text";
  let initialPenalty = 0.5;

  // Confirmation modal state
  let showConfirmClose = false;

  /**
   * Staging area for resource files, always a fresh id.
   *
   * Files are attached to it while the dialog is open — which is what makes
   * uploading (and previewing) work before the exercise exists anywhere — and
   * committed onto the real exercise on save. Closing without saving throws
   * the staged set away, like every other field in this dialog.
   */
  let resourceStagingId = "";
  let resourcesCommitted = false;

  // Preview state
  let isPreviewLoading = false;
  let previewPdfUrl: string | null = null;
  let previewSolutionPdfUrl: string | null = null;
  // Both panes start collapsed: there is nothing to preview until the user
  // compiles, so reserving half the dialog for an empty placeholder on open
  // wastes space. Expanding either pane is still one click away.
  let showAngabePreview = false;
  let showLoesungPreview = false;
  let showLatexPanel = true;
  $: hasAnyPreview = showAngabePreview || showLoesungPreview;
  let isSaving = false;
  let errorMsg = "";

  /**
   * Move the staged files onto the exercise that was just written. Upload
   * failures are reported but never fail the save — the exercise itself is
   * already stored, and the files stay staged locally.
   */
  async function commitStagedResources(exerciseId: string, key: CryptoKey | null) {
    try {
      const { errors } = await exerciseResourceRepository.commit(
        resourceStagingId,
        exerciseId,
        key
      );
      resourcesCommitted = true;
      if (errors.length > 0) {
        console.warn("Some resource files could not be synced:", errors);
      }
    } catch (err) {
      console.warn("Failed to store resource files:", err);
    }
  }

  function insertResourceSnippet(snippet: string) {
    editorLatexBody = `${editorLatexBody}\n${snippet}\n`;
  }

  function handleToggleLatex() {
    showLatexPanel = !showLatexPanel;
  }

  // Track initialization on isOpen or exercise props change
  let lastOpenState = false;
  $: if (isOpen && !lastOpenState) {
    initForm();
    lastOpenState = true;
  } else if (!isOpen && lastOpenState) {
    lastOpenState = false;
    cleanupPreview();
  }

  function initForm() {
    if (isCreatingVersion && versionBaseEx) {
      editorName = versionBaseEx.name || translate("exercises.untitled");
      editorTopicTag = versionBaseEx.topicTag || "_General";
      editorGrade = versionBaseEx.grade || "";
      editorSubject = versionBaseEx.subject || "";
      editorVariantKey = versionBaseEx.variantKey || "";
      editorLatexBody = versionBaseEx.latexBody || "";
      editorQuestionType = versionBaseEx.questionType === "mc" ? "mc" : "free_text";
      editorPenalty = versionBaseEx.penalty || 0.5;
    } else if (editingExercise) {
      editorName = editingExercise.name || translate("exercises.untitled");
      editorTopicTag = editingExercise.topicTag || "_General";
      editorGrade = editingExercise.grade || "";
      editorSubject = editingExercise.subject || "";
      editorVariantKey = editingExercise.variantKey || "";
      editorLatexBody = editingExercise.latexBody || "";
      editorQuestionType = editingExercise.questionType === "mc" ? "mc" : "free_text";
      editorPenalty = editingExercise.penalty || 0.5;
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
    // Seed the staging area from whichever exercise is being edited or
    // versioned; a new version therefore starts with the base version's
    // figures without ever writing back to it.
    resourceStagingId = crypto.randomUUID();
    resourcesCommitted = false;
    const resourceSourceId = isCreatingVersion ? versionBaseEx?.id : editingExercise?.id;
    if (resourceSourceId) {
      void exerciseResourceRepository.seedStaging(
        resourceSourceId,
        resourceStagingId,
        get(sessionStore).sessionKey
      );
    }
    showAngabePreview = false;
    showLoesungPreview = false;
    showConfirmClose = false;
    errorMsg = "";
    mcOptionsError = "";
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

  function syncMcStateFromLatex() {
    const parsed = parseMcOptions(editorLatexBody);
    mcQuestionText = parsed.questionText;
    mcOptions = parsed.options;
  }

  function regenerateMcLatex() {
    editorLatexBody = buildMcOptionsLatex(mcQuestionText, mcOptions);
  }

  function handleQuestionTypeChange() {
    if (editorQuestionType !== "free_text" && mcOptions.length === 0) {
      mcQuestionText = mcQuestionText.trim() || "Frage hier eingeben...";
      mcOptions = [
        { text: "", correct: false },
        { text: "", correct: false },
      ];
      regenerateMcLatex();
    }
  }

  function updateMcQuestionText(text: string) {
    mcQuestionText = text;
    regenerateMcLatex();
  }

  function updateOptionText(index: number, text: string) {
    mcOptions = mcOptions.map((o, i) => (i === index ? { ...o, text } : o));
    regenerateMcLatex();
  }

  function toggleOptionCorrect(index: number) {
    mcOptions = mcOptions.map((o, i) => (i === index ? { ...o, correct: !o.correct } : o));
    regenerateMcLatex();
  }

  function addMcOption() {
    if (mcOptions.length >= 8) return;
    mcOptions = [...mcOptions, { text: "", correct: false }];
    regenerateMcLatex();
  }

  function removeMcOption(index: number) {
    if (mcOptions.length <= 2) return;
    mcOptions = mcOptions.filter((_, i) => i !== index);
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

  $: isDirty =
    (editingExercise || isCreatingVersion
      ? false
      : editorName !== initialName ||
        editorTopicTag !== initialTopicTag ||
        editorGrade !== initialGrade ||
        editorSubject !== initialSubject) ||
    editorVariantKey !== initialVariantKey ||
    editorLatexBody !== initialLatexBody ||
    editorQuestionType !== initialQuestionType ||
    (editorQuestionType !== "free_text" && editorPenalty !== initialPenalty);

  function requestClose() {
    if (isDirty) {
      showConfirmClose = true;
    } else {
      forceClose();
    }
  }

  function forceClose() {
    showConfirmClose = false;
    cleanupPreview();
    // Staged files belong to the dialog, not to the library: unless they were
    // committed by a save, they go with it.
    if (!resourcesCommitted && resourceStagingId) {
      void exerciseResourceRepository.deleteForExercise(resourceStagingId);
    }
    dispatch("close");
  }

  function handleKeydown(e: KeyboardEvent) {
    if (!isOpen || showConfirmClose) return;
    if (e.key === "Escape") {
      requestClose();
    }
  }

  async function handlePreviewExercise() {
    isPreviewLoading = true;
    errorMsg = "";
    try {
      const getPreamble = (extraOpts: string) => `\\documentclass[a4paper]{article}
\\usepackage[${extraOpts}]{sty/Schulaufgabe}
\\usepackage{bbding}
\\usepackage{pifont}
\\usepackage{fontspec}
\\usepackage{framed}
\\usepackage{enumitem}
\\usetikzlibrary{shapes.geometric, arrows}
\\usepackage{sty/tikz-uml}
\\neverindent
\\WarningsOff
\\renewcommand{\\Namenszeile}{}
\\AtBeginDocument{
  \\pagestyle{empty}
  \\thispagestyle{empty}
  \\lhead{}
  \\chead{}
  \\rhead{}
  \\lfoot{}
  \\cfoot{}
  \\rfoot{}
}`;

      const formattedBody = formatExerciseLatex(editorLatexBody, editorName || "Aufgabe");

      const fullTexAngabe = `${getPreamble('sans')}\n\\setboolean{Antworten}{false}\n\\begin{document}\n\\leavevmode\\par\n${formattedBody}\n\\end{document}`;
      const fullTexLoesung = `${getPreamble('sans,antworten')}\n\\setboolean{Antworten}{true}\n\\begin{document}\n\\leavevmode\\par\n${formattedBody}\n\\end{document}`;

      const useLocal = $storagePolicyStore.latexCompilation === "local";
      // Staged files are inlined: they may not exist on the server yet, and in
      // the unsaved case they never will until the dialog is saved.
      const collected = await exerciseResourceRepository.collectForCompile(
        [{ id: resourceStagingId, label: editorName || "Aufgabe", staged: true }],
        get(sessionStore).sessionKey,
        true
      );
      const compileOpts = {
        resources: collected.inline,
        resourceExerciseIds: collected.exerciseIds
      };

      const exerciseTargetId = editingExercise?.id || resourceStagingId;
      const resAngabe = await compileWithCache(
        { kind: "exercise", id: exerciseTargetId, variant: "angabe" },
        fullTexAngabe,
        useLocal,
        undefined,
        false,
        compileOpts
      );
      const blobAngabe = new Blob([resAngabe.pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
      previewPdfUrl = URL.createObjectURL(blobAngabe);

      const resLoesung = await compileWithCache(
        { kind: "exercise", id: exerciseTargetId, variant: "loesung" },
        fullTexLoesung,
        useLocal,
        undefined,
        false,
        compileOpts
      );
      const blobLoesung = new Blob([resLoesung.pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      if (previewSolutionPdfUrl) URL.revokeObjectURL(previewSolutionPdfUrl);
      previewSolutionPdfUrl = URL.createObjectURL(blobLoesung);

      // Panes start collapsed (nothing to show); now that a PDF exists, open
      // the exam pane so the compile result is actually visible.
      showAngabePreview = true;

      // A missing figure does not fail the engine — say so instead of handing
      // back a PDF with a silent hole in it.
      const missing = [...(resAngabe.missingGraphics ?? []), ...(resLoesung.missingGraphics ?? [])];
      if (missing.length > 0) {
        errorMsg = `Preview rendered, but a graphic could not be loaded: ${missing[0]}`;
      }
    } catch (err: any) {
      console.error("Exercise preview failed:", err);
      errorMsg = translate("exercises.editor.previewFailed", { message: err.message || translate("exercises.editor.previewFailedUnknown") });
    } finally {
      isPreviewLoading = false;
    }
  }

  async function handleSaveExercise() {
    if (!editorName.trim()) {
      errorMsg = translate("exercises.editor.nameRequired");
      return;
    }

    if (editorQuestionType !== "free_text") {
      if (mcOptions.length < 2) {
        errorMsg = translate("exercises.editor.mcMinOptions");
        return;
      }
      if (!mcOptions.some((o) => o.correct)) {
        errorMsg = translate("exercises.editor.mcCorrectRequired");
        return;
      }
      regenerateMcLatex();
    }

    if (editorTopicTag) recordValue("exercise.topic", editorTopicTag);
    if (editorGrade) recordValue("exercise.grade", editorGrade);
    if (editorSubject) recordValue("exercise.subject", editorSubject);

    isSaving = true;
    errorMsg = "";
    const key = get(sessionStore).sessionKey;

    const optionsArray = editorQuestionType !== "free_text" ? mcOptions.map((o) => o.text) : undefined;
    const correctIndices = editorQuestionType !== "free_text" ? mcOptions.flatMap((o, i) => (o.correct ? [i] : [])) : undefined;

    try {
      if (isCreatingVersion && versionBaseEx) {
        let savedEx: ExerciseRecord;
        if ($isAuthenticated && $storagePolicyStore.storageMode !== "all-local") {
          const res = (await api.post(`/exercises/${versionBaseEx.id}/new-version`, {
            name: editorName,
            topic_tag: editorTopicTag,
            grade: editorGrade.trim() || null,
            subject: editorSubject.trim() || null,
            latex_body: editorLatexBody,
            question_type: editorQuestionType,
            correct_answers: editorQuestionType !== "free_text" ? { options: optionsArray, correct: correctIndices } : null,
          })) as any;

          savedEx = {
            id: res.id || crypto.randomUUID(),
            teacherId: res.teacher_id || $sessionStore.email || "local-teacher",
            name: res.name || editorName,
            topicTag: res.topic_tag || editorTopicTag,
            grade: res.grade || editorGrade.trim() || undefined,
            subject: res.subject || editorSubject.trim() || undefined,
            latexBody: res.latex_body || editorLatexBody,
            maxPoints: res.max_points || parseExerciseScore(editorLatexBody),
            version: res.version || (versionBaseEx.version || 1) + 1,
            questionType: res.question_type || editorQuestionType,
            options: optionsArray,
            correctAnswers: correctIndices,
            penalty: res.penalty ?? editorPenalty,
            exerciseGroupId: res.exercise_group_id || versionBaseEx.exerciseGroupId,
            variantKey: res.variant_key || editorVariantKey.trim() || undefined,
            isCurrent: res.is_current ?? true,
            updatedAt: new Date().toISOString(),
          };
          await saveExerciseEncrypted(savedEx, key);
        } else {
          const groupId = versionBaseEx.exerciseGroupId || crypto.randomUUID();
          if (!versionBaseEx.exerciseGroupId) {
            versionBaseEx.exerciseGroupId = groupId;
            await saveExerciseEncrypted(versionBaseEx, key);
          }
          savedEx = {
            ...versionBaseEx,
            id: crypto.randomUUID(),
            name: editorName,
            topicTag: editorTopicTag,
            grade: editorGrade.trim() || undefined,
            subject: editorSubject.trim() || undefined,
            latexBody: editorLatexBody,
            maxPoints: parseExerciseScore(editorLatexBody),
            version: (versionBaseEx.version || 1) + 1,
            questionType: editorQuestionType,
            options: optionsArray,
            correctAnswers: correctIndices,
            penalty: editorPenalty,
            exerciseGroupId: groupId,
            variantKey: editorVariantKey.trim() || undefined,
            isCurrent: true,
            updatedAt: new Date().toISOString(),
          };
          await saveExerciseEncrypted({ ...versionBaseEx, isCurrent: false }, key);
          await saveExerciseEncrypted(savedEx, key);
        }

        // A new version is a new exercise row; the staged set (the base
        // version's files plus anything added here) becomes its file set.
        await commitStagedResources(savedEx.id, key);
        dispatch("save", { exercise: savedEx, isNewVersion: true });
        forceClose();
        return;
      }

      const computedScore = parseExerciseScore(editorLatexBody);
      const id = editingExercise?.id || crypto.randomUUID();

      const record: ExerciseRecord = {
        id,
        teacherId: editingExercise?.teacherId || $sessionStore.email || "local-teacher",
        name: editorName,
        topicTag: editorTopicTag,
        grade: editorGrade.trim() || undefined,
        subject: editorSubject.trim() || undefined,
        latexBody: editorLatexBody,
        maxPoints: computedScore,
        version: editingExercise ? editingExercise.version : 1,
        questionType: editorQuestionType,
        options: optionsArray,
        correctAnswers: correctIndices,
        penalty: editorQuestionType !== "free_text" ? editorPenalty : editingExercise?.penalty || 0,
        exerciseGroupId: editingExercise?.exerciseGroupId,
        variantKey: editorVariantKey.trim() || undefined,
        isCurrent: editingExercise?.isCurrent ?? true,
        updatedAt: new Date().toISOString(),
      };

      await saveExerciseEncrypted(record, key);

      // If exercise belongs to a group, cascade group metadata updates (name, topicTag, grade, subject) to all sister exercises locally
      if (record.exerciseGroupId) {
        const allLocal = await loadExercisesEncrypted(key);
        for (const sister of allLocal) {
          if (sister.exerciseGroupId === record.exerciseGroupId && sister.id !== record.id) {
            const updatedSister: ExerciseRecord = {
              ...sister,
              name: record.name,
              topicTag: record.topicTag,
              grade: record.grade,
              subject: record.subject,
              updatedAt: new Date().toISOString(),
            };
            await saveExerciseEncrypted(updatedSister, key);
          }
        }
      }

      if ($isAuthenticated && $storagePolicyStore.storageMode !== "all-local") {
        try {
          const payload = {
            name: record.name,
            topic_tag: record.topicTag,
            grade: record.grade || null,
            subject: record.subject || null,
            latex_body: record.latexBody,
            variant_key: record.variantKey || null,
            question_type: record.questionType || "free_text",
            correct_answers: editorQuestionType !== "free_text" ? { options: optionsArray, correct: correctIndices } : null,
            penalty: record.penalty || 0,
          };
          if (editingExercise) {
            await api.patch(`/exercises/${id}`, payload);
          } else {
            await api.post("/exercises", {
              id: record.id,
              ...payload,
            });
          }
        } catch (apiErr) {
          console.warn("Failed to sync exercise to server:", apiErr);
        }
      }

      await commitStagedResources(record.id, key);
      dispatch("save", { exercise: record, isNewVersion: false });
      forceClose();
    } catch (err: any) {
      errorMsg = translate("exercises.editor.saveFailed", { message: err.message });
    } finally {
      isSaving = false;
    }
  }

  const editorColumnBase =
    "flex flex-col h-full min-h-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 transition-all duration-200 ease-[ease]";
  // Below `lg` this column stacks above DualPdfPreview instead of sitting
  // beside it. DualPdfPreview carries its own explicit `min-height: 18rem`
  // (DualPdfPreview.svelte), which flexbox honours as a real floor; this
  // column's `overflow-hidden` resets its own automatic minimum to 0, so
  // without a matching floor here the flex distribution squeezes it toward
  // nothing first — collapsing the LaTeX/MC inputs to invisible on phones.
  $: editorColumnClass = showLatexPanel
    ? `${editorColumnBase} min-h-[20rem] flex-1 min-w-0 p-0 gap-0 lg:min-h-0`
    : `${editorColumnBase} w-full h-10 flex-none min-w-0 p-0 lg:h-full lg:w-[38px] lg:flex-[0_0_38px] lg:min-w-[38px]`;
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <Modal open={isOpen} size="full" bare onClose={requestClose} labelledBy="exercise-editor-title">
    <div
      class="flex h-full max-h-full w-full flex-col overflow-hidden"
    >
      <div class="flex shrink-0 flex-col gap-[0.65rem] border-b border-slate-700 bg-slate-800 px-5 py-4">
        <div class="flex w-full items-center justify-between">
          <div class="flex items-center gap-[0.65rem]">
            <h3 id="exercise-editor-title" class="m-0 text-[1.15rem] text-slate-100">
              {isCreatingVersion
                ? $t("exercises.editor.titleNewVersion", { name: editorName })
                : editingExercise
                  ? $t("exercises.editor.titleEdit", { name: editorName })
                  : $t("exercises.editor.titleCreate")}
            </h3>
            {#if isCreatingVersion}
              <span class="rounded bg-sky-400/15 border border-sky-400/30 px-2 py-[0.15rem] text-xs font-semibold text-sky-400">v{(versionBaseEx?.version || 1) + 1}</span>
            {/if}
          </div>
          <button type="button" class="cursor-pointer rounded border-0 bg-transparent p-1 text-[1.25rem] leading-none text-slate-400 hover:text-slate-100" on:click={requestClose}>✕</button>
        </div>

        <div class="flex flex-wrap items-center gap-[0.85rem] rounded-md border border-slate-700 bg-slate-900 px-3 py-2">
          {#if editingExercise || isCreatingVersion}
            <div class="flex flex-wrap items-center gap-[0.45rem] text-[0.85rem]">
              <span class="text-[0.8rem] text-slate-400">{$t("exercises.editor.groupLabel")}</span>
              <strong class="font-semibold text-slate-100">{editorName}</strong>
              <span class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.15rem] text-xs text-slate-300">🏷️ {editorTopicTag}</span>
              {#if editorGrade}
                <span class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.15rem] text-xs text-slate-300">{$t("exercises.editor.gradeBadge", { grade: editorGrade })}</span>
              {/if}
              {#if editorSubject}
                <span class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.15rem] text-xs text-slate-300">📚 {editorSubject}</span>
              {/if}
            </div>

            <div class="flex items-center gap-[0.35rem] text-[0.8rem]">
              <label for="editorVariantKey" class="whitespace-nowrap font-semibold text-slate-400">{$t("exercises.editor.variantKeyLabel")}</label>
              <input
                id="editorVariantKey"
                type="text"
                bind:value={editorVariantKey}
                placeholder={$t("exercises.editor.variantKeyPlaceholder")}
                class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.3rem] text-[0.825rem] text-slate-100 focus:border-sky-400 focus:outline-none"
              />
            </div>
          {:else}
            <div class="flex w-full flex-wrap items-center gap-[0.65rem]">
              <div class="flex items-center gap-[0.35rem] text-[0.8rem]">
                <label for="editorName" class="whitespace-nowrap font-semibold text-slate-400">{$t("exercises.editor.nameLabel")}</label>
                <input
                  id="editorName"
                  type="text"
                  bind:value={editorName}
                  required
                  placeholder={$t("exercises.editor.namePlaceholder")}
                  class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.3rem] text-[0.825rem] text-slate-100 focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div class="flex items-center gap-[0.35rem] text-[0.8rem]">
                <label for="editorTopic" class="whitespace-nowrap font-semibold text-slate-400">{$t("exercises.editor.topicLabel")}</label>
                <SuggestInput
                  id="editorTopic"
                  storageKey="exercise.topic"
                  bind:value={editorTopicTag}
                  placeholder="_Vererbung"
                  required
                  class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.3rem] text-[0.825rem] text-slate-100 focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div class="flex items-center gap-[0.35rem] text-[0.8rem]">
                <label for="editorGrade" class="whitespace-nowrap font-semibold text-slate-400">{$t("exercises.editor.gradeLabel")}</label>
                <SuggestInput
                  id="editorGrade"
                  storageKey="exercise.grade"
                  bind:value={editorGrade}
                  placeholder={$t("exercises.editor.gradePlaceholder")}
                  class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.3rem] text-[0.825rem] text-slate-100 focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div class="flex items-center gap-[0.35rem] text-[0.8rem]">
                <label for="editorSubject" class="whitespace-nowrap font-semibold text-slate-400">{$t("exercises.editor.subjectLabel")}</label>
                <SuggestInput
                  id="editorSubject"
                  storageKey="exercise.subject"
                  bind:value={editorSubject}
                  placeholder={$t("exercises.editor.subjectPlaceholder")}
                  class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.3rem] text-[0.825rem] text-slate-100 focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div class="flex items-center gap-[0.35rem] text-[0.8rem]">
                <label for="editorVariantKey" class="whitespace-nowrap font-semibold text-slate-400">{$t("exercises.editor.variantKeyLabelPlain")}</label>
                <input
                  id="editorVariantKey"
                  type="text"
                  bind:value={editorVariantKey}
                  placeholder={$t("exercises.editor.variantKeyPlaceholderPlain")}
                  class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.3rem] text-[0.825rem] text-slate-100 focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div class="flex items-center gap-[0.35rem] text-[0.8rem]">
                <span class="whitespace-nowrap font-semibold text-slate-400">{$t("exercises.editor.exerciseTypeLabel")}</span>
                <div class="inline-flex rounded-md border border-slate-700 bg-slate-900 p-0.5">
                  <button
                    type="button"
                    class={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                      editorQuestionType === "free_text"
                        ? "bg-sky-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                    on:click={() => {
                      editorQuestionType = "free_text";
                      handleQuestionTypeChange();
                    }}
                  >
                    {$t("exercises.editor.freeTextButton")}
                  </button>
                  <button
                    type="button"
                    class={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
                      editorQuestionType === "mc"
                        ? "bg-sky-600 text-white shadow-sm"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                    on:click={() => {
                      editorQuestionType = "mc";
                      handleQuestionTypeChange();
                    }}
                  >
                    {$t("exercises.editor.mcButton")}
                  </button>
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>

      {#if errorMsg}
        <div class="shrink-0 overflow-y-auto max-h-[200px] whitespace-pre-wrap break-all border-l-4 border-red-500 bg-red-500/15 px-6 py-3 text-[0.875rem] text-red-300 font-mono">{errorMsg}</div>
      {/if}

      <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5 lg:flex-row lg:overflow-hidden">
        <div class={editorColumnClass}>
          {#if showLatexPanel}
            <button
              type="button"
              class="box-border flex w-full shrink-0 cursor-pointer items-center justify-between gap-2 border-0 border-b border-slate-700 bg-slate-800 px-3 py-2 text-left transition-colors duration-150 ease-[ease] hover:bg-slate-700 group"
              on:click={handleToggleLatex}
              title={$t("exercises.editor.collapseLatexTitle")}
            >
              <div class="flex min-w-0 items-center gap-2">
                <span class="whitespace-nowrap text-[0.85rem] font-semibold text-slate-100">{$t("exercises.editor.latexSourceCodeLabel")}</span>
                <span class="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-sky-400/20 bg-sky-400/10 px-2 py-[0.15rem] text-xs text-sky-400">
                  {$t("exercises.editor.autoScoreLabel", { score: parseExerciseScore(editorLatexBody) })}
                </span>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  class="shrink-0 cursor-pointer rounded border-0 bg-sky-600 px-3 py-[0.35rem] text-[0.8rem] font-semibold text-white transition-colors duration-150 ease-[ease] [&:hover:not(:disabled)]:bg-sky-700"
                  on:click|stopPropagation={handlePreviewExercise}
                  disabled={isPreviewLoading}
                  title={$t("exercises.editor.previewButtonTitle")}
                >
                  {isPreviewLoading ? $t("exercises.editor.previewButtonLoading") : $t("exercises.editor.previewButton")}
                </button>
                <span class="shrink-0 text-base font-bold text-slate-400 transition-colors duration-150 ease-[ease] group-hover:text-sky-400">›</span>
              </div>
            </button>

            <div class="flex min-h-0 flex-1 flex-col gap-[0.4rem] overflow-hidden p-2">
              {#if editorQuestionType !== "free_text"}
                <div class="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800/90 p-3 text-xs">
                  <div class="flex items-center justify-between">
                    <span class="font-semibold text-sky-400">
                      {$t("exercises.editor.mcEditorTitle")}
                    </span>
                    <span class="text-[0.75rem] text-slate-400">
                      {$t("exercises.editor.mcEditorHint")}
                    </span>
                  </div>

                  <div class="flex flex-col gap-1">
                    <label class="font-semibold text-slate-300">{$t("exercises.editor.mcQuestionTextLabel")}</label>
                    <LatexEditor
                      bind:value={mcQuestionText}
                      rows={4}
                      showQuickInsert
                      on:change={regenerateMcLatex}
                    />
                  </div>

                  <div class="flex flex-col gap-1">
                    <label class="font-semibold text-slate-300" for="mc-penalty">
                      {$t("exercises.editor.mcPenaltyLabel")}
                    </label>
                    <input
                      id="mc-penalty"
                      type="number"
                      step="0.25"
                      min="0"
                      bind:value={editorPenalty}
                      class="w-24 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-100 focus:border-sky-400 focus:outline-none"
                    />
                  </div>

                  <div class="flex flex-col gap-2">
                    <div class="flex items-center justify-between text-slate-300 font-semibold">
                      <span>{$t("exercises.editor.mcOptionsLabel", { count: mcOptions.length })}</span>
                      <button
                        type="button"
                        class="rounded bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        on:click={addMcOption}
                        disabled={mcOptions.length >= 8}
                      >
                        {$t("exercises.editor.mcAddOptionButton")}
                      </button>
                    </div>

                    {#each mcOptions as option, index}
                      <div class="flex items-center gap-2 rounded border border-slate-700/80 bg-slate-900/80 p-2">
                        <input
                          type="checkbox"
                          checked={option.correct}
                          on:change={() => toggleOptionCorrect(index)}
                          title={$t("exercises.editor.mcOptionCorrectTitle")}
                          class="h-4 w-4 rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-400"
                        />

                        <input
                          type="text"
                          value={option.text}
                          on:input={(e) => updateOptionText(index, e.currentTarget.value)}
                          placeholder={$t("exercises.editor.mcOptionPlaceholder", { number: index + 1 })}
                          class="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 placeholder-slate-500 focus:border-sky-400 focus:outline-none"
                        />

                        <span class={`text-[0.7rem] font-semibold px-1.5 py-0.5 rounded ${option.correct ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'text-slate-500'}`}>
                          {option.correct ? $t("exercises.editor.mcOptionCorrect") : $t("exercises.editor.mcOptionIncorrect")}
                        </span>

                        <button
                          type="button"
                          class="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-red-400 disabled:opacity-30 disabled:hover:text-slate-400"
                          on:click={() => removeMcOption(index)}
                          disabled={mcOptions.length <= 2}
                          title={$t("exercises.editor.mcOptionRemoveTitle")}
                        >
                          ✕
                        </button>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
              <div class="flex items-center justify-between px-1 text-xs">
                <span class="font-semibold text-slate-300">{$t("exercises.editor.latexPreviewLabel")}</span>
              </div>
              <LatexEditor bind:value={editorLatexBody} rows={12} showQuickInsert />

              <ExerciseResourcePanel
                exerciseId={resourceStagingId}
                onInsert={insertResourceSnippet}
              />
            </div>
          {:else}
            <button
              type="button"
              class="flex h-full w-full flex-row items-center gap-4 border-0 bg-slate-900 px-3 py-[0.2rem] text-slate-400 transition-all duration-150 ease-[ease] hover:bg-slate-800 hover:text-sky-400 group lg:flex-col lg:px-[0.2rem] lg:py-3"
              on:click={handleToggleLatex}
              title={$t("exercises.editor.expandLatexTitle")}
            >
              <span class="flex h-6 w-6 shrink-0 rotate-90 items-center justify-center rounded border border-slate-700 bg-slate-800 text-[0.9rem] font-bold group-hover:border-sky-400 group-hover:bg-sky-600 group-hover:text-white lg:rotate-0">›</span>
              <span class="shrink-0 text-[0.95rem] leading-none">💻</span>
              <span
                class="whitespace-nowrap text-[0.8rem] font-semibold tracking-[0.5px] lg:[writing-mode:vertical-rl] lg:[transform:rotate(180deg)]"
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
        />
      </div>

      <div class="flex justify-end gap-3 border-t border-slate-700 bg-slate-900 px-6 py-5">
        <button type="button" class="cursor-pointer rounded-md border-0 bg-slate-700 px-5 py-[0.6rem] text-[0.875rem] font-semibold text-white hover:bg-slate-600" on:click={requestClose}>{$t("common.cancel")}</button>
        <button
          type="button"
          class="cursor-pointer rounded-md border-0 bg-blue-600 px-5 py-[0.6rem] text-[0.875rem] font-semibold text-white [&:hover:not(:disabled)]:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          on:click={handleSaveExercise}
          disabled={isSaving}
        >
          {isSaving
            ? $t("exercises.editor.saveButtonSaving")
            : isCreatingVersion
              ? $t("exercises.editor.saveButtonNewVersion")
              : $t("exercises.editor.saveButton")}
        </button>
      </div>
    </div>
  </Modal>
{/if}

<ConfirmDialog
  isOpen={showConfirmClose}
  title={$t("exercises.editor.discardTitle")}
  message={$t("exercises.editor.discardMessage")}
  confirmText={$t("exercises.confirmDiscard.confirmText")}
  cancelText={$t("exercises.confirmDiscard.cancelText")}
  on:confirm={forceClose}
  on:cancel={() => (showConfirmClose = false)}
/>
