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
  import { compileLatex } from "$lib/latex/compiler";
  import LatexEditor from "./LatexEditor.svelte";
  import ConfirmDialog from "./ConfirmDialog.svelte";
  import DualPdfPreview from "./DualPdfPreview.svelte";

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

  // Preview state
  let isPreviewLoading = false;
  let previewPdfUrl: string | null = null;
  let previewSolutionPdfUrl: string | null = null;
  let showAngabePreview = true;
  let showLoesungPreview = false;
  let showLatexPanel = true;
  $: hasAnyPreview = showAngabePreview || showLoesungPreview;
  let isSaving = false;
  let errorMsg = "";

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
      editorName = versionBaseEx.name || "Untitled";
      editorTopicTag = versionBaseEx.topicTag || "_General";
      editorGrade = versionBaseEx.grade || "";
      editorSubject = versionBaseEx.subject || "";
      editorVariantKey = versionBaseEx.variantKey || "";
      editorLatexBody = versionBaseEx.latexBody || "";
      editorQuestionType = versionBaseEx.questionType === "mc" ? "mc" : "free_text";
      editorPenalty = versionBaseEx.penalty || 0.5;
    } else if (editingExercise) {
      editorName = editingExercise.name || "Untitled";
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
    showAngabePreview = true;
    showLoesungPreview = false;
    showConfirmClose = false;
    errorMsg = "";
    mcOptionsError = "";
    syncMcStateFromLatex();

    cleanupPreview();
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

      const resAngabe = await compileLatex(fullTexAngabe, useLocal, undefined, false);
      const blobAngabe = new Blob([resAngabe.pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
      previewPdfUrl = URL.createObjectURL(blobAngabe);

      const resLoesung = await compileLatex(fullTexLoesung, useLocal, undefined, false);
      const blobLoesung = new Blob([resLoesung.pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      if (previewSolutionPdfUrl) URL.revokeObjectURL(previewSolutionPdfUrl);
      previewSolutionPdfUrl = URL.createObjectURL(blobLoesung);
    } catch (err: any) {
      console.error("Exercise preview failed:", err);
      errorMsg = `Preview failed: ${err.message || "Unknown compilation error"}`;
    } finally {
      isPreviewLoading = false;
    }
  }

  async function handleSaveExercise() {
    if (!editorName.trim()) {
      errorMsg = "Exercise name is required.";
      return;
    }

    if (editorQuestionType !== "free_text") {
      if (mcOptions.length < 2) {
        errorMsg = "Multiple Choice exercise must have at least 2 options.";
        return;
      }
      if (!mcOptions.some((o) => o.correct)) {
        errorMsg = "At least one option must be marked as correct.";
        return;
      }
      regenerateMcLatex();
    }

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

      dispatch("save", { exercise: record, isNewVersion: false });
      forceClose();
    } catch (err: any) {
      errorMsg = `Failed to save exercise: ${err.message}`;
    } finally {
      isSaving = false;
    }
  }

  const editorColumnBase =
    "flex flex-col h-full min-h-0 overflow-hidden rounded-lg border border-slate-700 bg-slate-900 transition-all duration-200 ease-[ease]";
  $: editorColumnClass = showLatexPanel
    ? `${editorColumnBase} flex-1 min-w-0 p-0 gap-0`
    : `${editorColumnBase} w-[38px] flex-[0_0_38px] min-w-[38px] p-0`;
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div
    class="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/80 p-6 backdrop-blur-[4px]"
    role="button"
    tabindex="-1"
    on:click|self={requestClose}
  >
    <div
      class="flex h-[92vh] max-h-[92vh] w-[95vw] max-w-[1700px] flex-col overflow-hidden rounded-xl border border-slate-700 bg-slate-800 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exercise-editor-title"
    >
      <div class="flex shrink-0 flex-col gap-[0.65rem] border-b border-slate-700 bg-slate-800 px-5 py-4">
        <div class="flex w-full items-center justify-between">
          <div class="flex items-center gap-[0.65rem]">
            <h3 id="exercise-editor-title" class="m-0 text-[1.15rem] text-slate-100">
              {isCreatingVersion
                ? `New Version: ${editorName}`
                : editingExercise
                  ? `Edit Exercise: ${editorName}`
                  : "Create New Exercise"}
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
              <span class="text-[0.8rem] text-slate-400">Exercise Group:</span>
              <strong class="font-semibold text-slate-100">{editorName}</strong>
              <span class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.15rem] text-xs text-slate-300">🏷️ {editorTopicTag}</span>
              {#if editorGrade}
                <span class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.15rem] text-xs text-slate-300">🎓 Grade {editorGrade}</span>
              {/if}
              {#if editorSubject}
                <span class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.15rem] text-xs text-slate-300">📚 {editorSubject}</span>
              {/if}
            </div>

            <div class="flex items-center gap-[0.35rem] text-[0.8rem]">
              <label for="editorVariantKey" class="whitespace-nowrap font-semibold text-slate-400">Variant Key:</label>
              <input
                id="editorVariantKey"
                type="text"
                bind:value={editorVariantKey}
                placeholder="e.g. Moebel, Fahrzeug"
                class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.3rem] text-[0.825rem] text-slate-100 focus:border-sky-400 focus:outline-none"
              />
            </div>
          {:else}
            <div class="flex w-full flex-wrap items-center gap-[0.65rem]">
              <div class="flex items-center gap-[0.35rem] text-[0.8rem]">
                <label for="editorName" class="whitespace-nowrap font-semibold text-slate-400">Name *</label>
                <input
                  id="editorName"
                  type="text"
                  bind:value={editorName}
                  required
                  placeholder="Group Name"
                  class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.3rem] text-[0.825rem] text-slate-100 focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div class="flex items-center gap-[0.35rem] text-[0.8rem]">
                <label for="editorTopic" class="whitespace-nowrap font-semibold text-slate-400">Topic *</label>
                <input
                  id="editorTopic"
                  type="text"
                  bind:value={editorTopicTag}
                  placeholder="_Vererbung"
                  required
                  class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.3rem] text-[0.825rem] text-slate-100 focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div class="flex items-center gap-[0.35rem] text-[0.8rem]">
                <label for="editorGrade" class="whitespace-nowrap font-semibold text-slate-400">Grade</label>
                <input
                  id="editorGrade"
                  type="text"
                  bind:value={editorGrade}
                  placeholder="e.g. 10"
                  class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.3rem] text-[0.825rem] text-slate-100 focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div class="flex items-center gap-[0.35rem] text-[0.8rem]">
                <label for="editorSubject" class="whitespace-nowrap font-semibold text-slate-400">Subject</label>
                <input
                  id="editorSubject"
                  type="text"
                  bind:value={editorSubject}
                  placeholder="e.g. Informatik"
                  class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.3rem] text-[0.825rem] text-slate-100 focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div class="flex items-center gap-[0.35rem] text-[0.8rem]">
                <label for="editorVariantKey" class="whitespace-nowrap font-semibold text-slate-400">Variant Key</label>
                <input
                  id="editorVariantKey"
                  type="text"
                  bind:value={editorVariantKey}
                  placeholder="e.g. Moebel"
                  class="rounded border border-slate-700 bg-slate-800 px-2 py-[0.3rem] text-[0.825rem] text-slate-100 focus:border-sky-400 focus:outline-none"
                />
              </div>

              <div class="flex items-center gap-[0.35rem] text-[0.8rem]">
                <span class="whitespace-nowrap font-semibold text-slate-400">Exercise Type:</span>
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
                    📝 Free Text
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
                    ☑️ Multiple Choice (MC)
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

      <div class="flex min-h-0 flex-1 gap-4 overflow-hidden p-5 max-[1100px]:flex-col max-[1100px]:overflow-y-auto">
        <div class={editorColumnClass}>
          {#if showLatexPanel}
            <button
              type="button"
              class="box-border flex w-full shrink-0 cursor-pointer items-center justify-between gap-2 border-0 border-b border-slate-700 bg-slate-800 px-3 py-2 text-left transition-colors duration-150 ease-[ease] hover:bg-slate-700 group"
              on:click={handleToggleLatex}
              title="Click to collapse LaTeX Code Panel"
            >
              <div class="flex min-w-0 items-center gap-2">
                <span class="whitespace-nowrap text-[0.85rem] font-semibold text-slate-100">💻 LaTeX Source Code</span>
                <span class="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border border-sky-400/20 bg-sky-400/10 px-2 py-[0.15rem] text-xs text-sky-400">
                  Auto-Score: <strong class="text-sky-400">{parseExerciseScore(editorLatexBody)} Pkt</strong>
                </span>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  class="shrink-0 cursor-pointer rounded border-0 bg-sky-600 px-3 py-[0.35rem] text-[0.8rem] font-semibold text-white transition-colors duration-150 ease-[ease] [&:hover:not(:disabled)]:bg-sky-700"
                  on:click|stopPropagation={handlePreviewExercise}
                  disabled={isPreviewLoading}
                  title="Compile & preview exercise PDF"
                >
                  {isPreviewLoading ? "Compiling..." : "🔍 Live Preview PDF"}
                </button>
                <span class="shrink-0 text-base font-bold text-slate-400 transition-colors duration-150 ease-[ease] group-hover:text-sky-400">›</span>
              </div>
            </button>

            <div class="flex min-h-0 flex-1 flex-col gap-[0.4rem] overflow-hidden p-2">
              {#if editorQuestionType !== "free_text"}
                <div class="flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800/90 p-3 text-xs">
                  <div class="flex items-center justify-between">
                    <span class="font-semibold text-sky-400">
                      Structured Options Editor (MC)
                    </span>
                    <span class="text-[0.75rem] text-slate-400">
                      Multiple correct options allowed
                    </span>
                  </div>

                  <div class="flex flex-col gap-1">
                    <label class="font-semibold text-slate-300">Question Text / Intro</label>
                    <LatexEditor bind:value={mcQuestionText} rows={4} on:change={regenerateMcLatex} />
                  </div>

                  <div class="flex flex-col gap-1">
                    <label class="font-semibold text-slate-300" for="mc-penalty">
                      Penalty per wrong cross (points deducted, right-minus-wrong)
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
                      <span>Options ({mcOptions.length})</span>
                      <button
                        type="button"
                        class="rounded bg-sky-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        on:click={addMcOption}
                        disabled={mcOptions.length >= 8}
                      >
                        + Add Option
                      </button>
                    </div>

                    {#each mcOptions as option, index}
                      <div class="flex items-center gap-2 rounded border border-slate-700/80 bg-slate-900/80 p-2">
                        <input
                          type="checkbox"
                          checked={option.correct}
                          on:change={() => toggleOptionCorrect(index)}
                          title="Mark option as correct"
                          class="h-4 w-4 rounded border-slate-700 bg-slate-800 text-sky-500 focus:ring-sky-400"
                        />

                        <input
                          type="text"
                          value={option.text}
                          on:input={(e) => updateOptionText(index, e.currentTarget.value)}
                          placeholder={`Option ${index + 1} text`}
                          class="flex-1 rounded border border-slate-700 bg-slate-800 px-2 py-1 text-slate-100 placeholder-slate-500 focus:border-sky-400 focus:outline-none"
                        />

                        <span class={`text-[0.7rem] font-semibold px-1.5 py-0.5 rounded ${option.correct ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : 'text-slate-500'}`}>
                          {option.correct ? "Richtig" : "Falsch"}
                        </span>

                        <button
                          type="button"
                          class="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-red-400 disabled:opacity-30 disabled:hover:text-slate-400"
                          on:click={() => removeMcOption(index)}
                          disabled={mcOptions.length <= 2}
                          title="Remove option"
                        >
                          ✕
                        </button>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
              <div class="flex items-center justify-between px-1 text-xs">
                <span class="font-semibold text-slate-300">Preview / Composed LaTeX Source</span>
              </div>
              <LatexEditor bind:value={editorLatexBody} rows={12} />
            </div>
          {:else}
            <button
              type="button"
              class="flex h-full w-full flex-col items-center gap-4 border-0 bg-slate-900 px-[0.2rem] py-3 text-slate-400 transition-all duration-150 ease-[ease] hover:bg-slate-800 hover:text-sky-400 group"
              on:click={handleToggleLatex}
              title="Click to expand LaTeX Code Panel"
            >
              <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-slate-700 bg-slate-800 text-[0.9rem] font-bold group-hover:border-sky-400 group-hover:bg-sky-600 group-hover:text-white">›</span>
              <span class="shrink-0 text-[0.95rem] leading-none">💻</span>
              <span class="whitespace-nowrap text-[0.8rem] font-semibold tracking-[0.5px]" style="writing-mode: vertical-rl; transform: rotate(180deg);">LaTeX Source Code ({parseExerciseScore(editorLatexBody)} Pkt)</span>
            </button>
          {/if}
        </div>

        <DualPdfPreview
          {previewPdfUrl}
          {previewSolutionPdfUrl}
          bind:showAngabePreview
          bind:showLoesungPreview
          titleAngabe="Exercise"
          titleLoesung="Solution"
          placeholderText="Click 'Live Preview PDF' to render"
        />
      </div>

      <div class="flex justify-end gap-3 border-t border-slate-700 bg-slate-900 px-6 py-5">
        <button type="button" class="cursor-pointer rounded-md border-0 bg-slate-700 px-5 py-[0.6rem] text-[0.875rem] font-semibold text-white hover:bg-slate-600" on:click={requestClose}>Cancel</button>
        <button
          type="button"
          class="cursor-pointer rounded-md border-0 bg-blue-600 px-5 py-[0.6rem] text-[0.875rem] font-semibold text-white [&:hover:not(:disabled)]:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          on:click={handleSaveExercise}
          disabled={isSaving}
        >
          {isSaving
            ? "Saving..."
            : isCreatingVersion
              ? "Save New Version"
              : "Save Exercise"}
        </button>
      </div>
    </div>
  </div>
{/if}

<ConfirmDialog
  isOpen={showConfirmClose}
  title="Discard Exercise Changes?"
  message="You have modified fields in this exercise. Discarding will lose your unsaved changes."
  confirmText="Discard Changes"
  cancelText="Keep Editing"
  on:confirm={forceClose}
  on:cancel={() => (showConfirmClose = false)}
/>
