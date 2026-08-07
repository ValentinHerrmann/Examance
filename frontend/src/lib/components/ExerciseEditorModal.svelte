<script lang="ts">
  import "./ExerciseEditorModal.css";
  import { createEventDispatcher, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import type { ExerciseRecord } from "$lib/db/schema";
  import { db } from "$lib/db/db";
  import { sessionStore, isAuthenticated } from "$lib/stores/session";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import { saveExerciseEncrypted, loadExercisesEncrypted } from "$lib/db/dbEncryption";
  import { api } from "$lib/api/client";
  import { parseExerciseScore, formatExerciseLatex } from "$lib/latex/scoreParser";
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

  // Initial state for dirty tracking
  let initialName = "";
  let initialTopicTag = "";
  let initialGrade = "";
  let initialSubject = "";
  let initialVariantKey = "";
  let initialLatexBody = "";

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
    } else if (editingExercise) {
      editorName = editingExercise.name || "Untitled";
      editorTopicTag = editingExercise.topicTag || "_General";
      editorGrade = editingExercise.grade || "";
      editorSubject = editingExercise.subject || "";
      editorVariantKey = editingExercise.variantKey || "";
      editorLatexBody = editingExercise.latexBody || "";
    } else {
      editorName = "New_Exercise";
      editorTopicTag = "_General";
      editorGrade = "";
      editorSubject = "";
      editorVariantKey = "";
      editorLatexBody = `\\begin{Aufgabe}{Neue Aufgabe}\nFrage hier eingeben... \\BE\n\\end{Aufgabe}`;
    }

    initialName = editorName;
    initialTopicTag = editorTopicTag;
    initialGrade = editorGrade;
    initialSubject = editorSubject;
    initialVariantKey = editorVariantKey;
    initialLatexBody = editorLatexBody;
    showAngabePreview = true;
    showLoesungPreview = false;
    showConfirmClose = false;
    errorMsg = "";

    cleanupPreview();
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
    editorLatexBody !== initialLatexBody;

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

    isSaving = true;
    errorMsg = "";
    const key = get(sessionStore).sessionKey;

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
            questionType: res.question_type || "free_text",
            penalty: res.penalty || 0,
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
        questionType: editingExercise?.questionType || "free_text",
        penalty: editingExercise?.penalty || 0,
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
          if (editingExercise) {
            await api.patch(`/exercises/${id}`, {
              name: record.name,
              topic_tag: record.topicTag,
              grade: record.grade || null,
              subject: record.subject || null,
              latex_body: record.latexBody,
              variant_key: record.variantKey || null,
            });
          } else {
            await api.post("/exercises", {
              id: record.id,
              name: record.name,
              topic_tag: record.topicTag,
              grade: record.grade || null,
              subject: record.subject || null,
              latex_body: record.latexBody,
              variant_key: record.variantKey || null,
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
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <div
    class="exercise-editor-modal-backdrop"
    role="button"
    tabindex="-1"
    on:click|self={requestClose}
  >
    <div
      class="exercise-editor-modal-content"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exercise-editor-title"
    >
      <div class="exercise-editor-modal-header">
        <div class="exercise-editor-modal-header-top">
          <div class="exercise-editor-modal-title-group">
            <h3 id="exercise-editor-title">
              {isCreatingVersion
                ? `New Version: ${editorName}`
                : editingExercise
                  ? `Edit Exercise: ${editorName}`
                  : "Create New Exercise"}
            </h3>
            {#if isCreatingVersion}
              <span class="exercise-editor-modal-version-badge">v{(versionBaseEx?.version || 1) + 1}</span>
            {/if}
          </div>
          <button type="button" class="exercise-editor-modal-close-btn" on:click={requestClose}>✕</button>
        </div>

        <div class="exercise-editor-modal-header-meta">
          {#if editingExercise || isCreatingVersion}
            <div class="exercise-editor-modal-hdr-group-info">
              <span class="exercise-editor-modal-hdr-label">Exercise Group:</span>
              <strong class="exercise-editor-modal-hdr-name">{editorName}</strong>
              <span class="exercise-editor-modal-hdr-pill">🏷️ {editorTopicTag}</span>
              {#if editorGrade}
                <span class="exercise-editor-modal-hdr-pill">🎓 Grade {editorGrade}</span>
              {/if}
              {#if editorSubject}
                <span class="exercise-editor-modal-hdr-pill">📚 {editorSubject}</span>
              {/if}
            </div>

            <div class="exercise-editor-modal-hdr-field">
              <label for="editorVariantKey">Variant Key:</label>
              <input
                id="editorVariantKey"
                type="text"
                bind:value={editorVariantKey}
                placeholder="e.g. Moebel, Fahrzeug"
              />
            </div>
          {:else}
            <div class="exercise-editor-modal-hdr-form-grid">
              <div class="exercise-editor-modal-hdr-field">
                <label for="editorName">Name *</label>
                <input
                  id="editorName"
                  type="text"
                  bind:value={editorName}
                  required
                  placeholder="Group Name"
                />
              </div>

              <div class="exercise-editor-modal-hdr-field">
                <label for="editorTopic">Topic *</label>
                <input
                  id="editorTopic"
                  type="text"
                  bind:value={editorTopicTag}
                  placeholder="_Vererbung"
                  required
                />
              </div>

              <div class="exercise-editor-modal-hdr-field">
                <label for="editorGrade">Grade</label>
                <input
                  id="editorGrade"
                  type="text"
                  bind:value={editorGrade}
                  placeholder="e.g. 10"
                />
              </div>

              <div class="exercise-editor-modal-hdr-field">
                <label for="editorSubject">Subject</label>
                <input
                  id="editorSubject"
                  type="text"
                  bind:value={editorSubject}
                  placeholder="e.g. Informatik"
                />
              </div>

              <div class="exercise-editor-modal-hdr-field">
                <label for="editorVariantKey">Variant Key</label>
                <input
                  id="editorVariantKey"
                  type="text"
                  bind:value={editorVariantKey}
                  placeholder="e.g. Moebel"
                />
              </div>
            </div>
          {/if}
        </div>
      </div>

      {#if errorMsg}
        <div class="exercise-editor-modal-error-banner">{errorMsg}</div>
      {/if}

      <div class="exercise-editor-modal-body">
        <div
          class="exercise-editor-modal-editor-column"
          class:exercise-editor-modal-expanded={showLatexPanel}
          class:exercise-editor-modal-collapsed={!showLatexPanel}
        >
          {#if showLatexPanel}
            <button
              type="button"
              class="exercise-editor-modal-panel-header-bar"
              on:click={handleToggleLatex}
              title="Click to collapse LaTeX Code Panel"
            >
              <div class="exercise-editor-modal-panel-header-left">
                <span class="exercise-editor-modal-panel-title">💻 LaTeX Source Code</span>
                <span class="exercise-editor-modal-score-indicator-badge">
                  Auto-Score: <strong>{parseExerciseScore(editorLatexBody)} Pkt</strong>
                </span>
              </div>
              <div class="exercise-editor-modal-panel-header-right">
                <button
                  type="button"
                  class="exercise-editor-modal-preview-btn-inline"
                  class:is-loading={isPreviewLoading}
                  on:click|stopPropagation={handlePreviewExercise}
                  disabled={isPreviewLoading}
                  title="Compile & preview exercise PDF"
                >
                  {isPreviewLoading ? "Compiling..." : "🔍 Live Preview PDF"}
                </button>
                <span class="exercise-editor-modal-header-icon">›</span>
              </div>
            </button>

            <div class="exercise-editor-modal-form-group exercise-editor-modal-latex-editor-group">
              <LatexEditor bind:value={editorLatexBody} rows={12} />
            </div>
          {:else}
            <button
              type="button"
              class="exercise-editor-modal-vertical-latex-strip"
              on:click={handleToggleLatex}
              title="Click to expand LaTeX Code Panel"
            >
              <span class="exercise-editor-modal-strip-icon">›</span>
              <span class="exercise-editor-modal-strip-emoji">💻</span>
              <span class="exercise-editor-modal-strip-title">LaTeX Source Code ({parseExerciseScore(editorLatexBody)} Pkt)</span>
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

      <div class="exercise-editor-modal-footer">
        <button type="button" class="exercise-editor-modal-cancel-btn" on:click={requestClose}>Cancel</button>
        <button
          type="button"
          class="exercise-editor-modal-save-btn"
          class:is-loading={isSaving}
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
