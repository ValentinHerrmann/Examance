<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import { get } from "svelte/store";
  import type { ExerciseRecord } from "#lib/db/schema";
  import { db } from "#lib/db/db";
  import { sessionStore, isAuthenticated } from "#lib/stores/session";
  import { effectiveLatexStore } from "#lib/stores/capabilities";
  import { saveExerciseEncrypted, loadExercisesEncrypted } from "#lib/db/dbEncryption";
  import { api } from "#lib/api/client";
  import { parseExerciseScore } from "#lib/latex/scoreParser";
  import {
    parseMcOptions,
    buildMcOptionsLatex,
    MC_MAX_COLUMNS,
    MC_MAX_OPTIONS,
    MC_MIN_OPTIONS,
    type McOption,
  } from "#lib/latex/mcOptions";
  import { getLatestForSlot } from "#lib/latex/compileCache";
  import { compileExercisePreview } from "#lib/latex/exercisePreview";
  import { pdfBytesToUrl } from "#lib/latex/pdfPreview";
  import { exerciseResourceRepository } from "#lib/repositories/exerciseResourceRepository";
  import ExerciseResourcePanel from "#lib/components/exercise/ExerciseResourcePanel.svelte";
  import LatexEditor from "./LatexEditor.svelte";
  import DualPdfPreview from "./DualPdfPreview.svelte";
  import SuggestInput from "#lib/components/common/SuggestInput.svelte";
  import { recordValue } from "#lib/utils/recentValues";
  import { t, translate } from "#lib/i18n";
  import InfoTip from "#lib/components/help/InfoTip.svelte";
  import { ConfirmDialog, Alert, Badge, Button, Checkbox, Icon, Modal, Select, TextInput, controlClass, controlSmClass } from "#lib/components/ui";
  import { faBook, faChevronLeft, faChevronRight, faCode, faPlus, faTag, faXmark } from "@fortawesome/free-solid-svg-icons";

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
  let mcOptions: McOption[] = $state.raw([]);
  /** Column layout of the options: "auto" (one per option) or an explicit count, as a <select> value. */
  let mcColumns = $state("auto");
  const MC_COLUMN_CHOICES = Array.from({ length: MC_MAX_COLUMNS }, (_, i) => String(i + 1));
  let mcOptionsError = "";
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

  // Confirmation modal state
  let showConfirmClose = $state(false);

  // Fresh staging id for resource files: lets upload/preview work before the exercise exists.
  // Committed onto the real exercise on save; closing without saving discards the staged set.
  let resourceStagingId = $state("");
  let resourcesCommitted = false;

  // Preview state
  let isPreviewLoading = $state(false);
  let previewPdfUrl: string | null = $state(null);
  let previewSolutionPdfUrl: string | null = $state(null);
  // Both panes start collapsed: there is nothing to preview until the user
  // compiles, so reserving half the dialog for an empty placeholder on open
  // wastes space. Expanding either pane is still one click away.
  let showAngabePreview = $state(false);
  let showLoesungPreview = $state(false);
  let showLatexPanel = $state(true);
  let hasAnyPreview = $derived(showAngabePreview || showLoesungPreview);
  let isSaving = $state(false);
  let errorMsg = $state("");

  // Move the staged files onto the just-written exercise. Upload failures never fail the save:
  // the exercise is already stored and the files stay staged locally.
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
  let lastOpenState = $state(false);

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
    mcColumns = parsed.columns === null ? "auto" : String(parsed.columns);
  }

  function regenerateMcLatex() {
    editorLatexBody = buildMcOptionsLatex(
      mcQuestionText,
      mcOptions,
      mcColumns === "auto" ? null : Number(mcColumns),
    );
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
    if (mcOptions.length >= MC_MAX_OPTIONS) return;
    mcOptions = [...mcOptions, { text: "", correct: false }];
    regenerateMcLatex();
  }

  function removeMcOption(index: number) {
    if (mcOptions.length <= MC_MIN_OPTIONS) return;
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
    (editorQuestionType !== "free_text" && editorPenalty !== initialPenalty)
  );

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
    onClose?.();
  }

  async function handlePreviewExercise() {
    isPreviewLoading = true;
    errorMsg = "";
    try {
      const res = await compileExercisePreview({
        cacheId: editingExercise?.id || resourceStagingId,
        name: editorName,
        latexBody: editorLatexBody,
        resourceOwnerId: resourceStagingId,
        staged: true,
        useLocal: $effectiveLatexStore === "local",
        key: get(sessionStore).sessionKey
      });
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
      previewPdfUrl = pdfBytesToUrl(res.angabe.pdfBytes);
      if (previewSolutionPdfUrl) URL.revokeObjectURL(previewSolutionPdfUrl);
      previewSolutionPdfUrl = pdfBytesToUrl(res.loesung.pdfBytes);

      // Panes start collapsed (nothing to show); now that a PDF exists, open
      // the exam pane so the compile result is actually visible.
      showAngabePreview = true;

      // A missing figure does not fail the engine — say so instead of handing
      // back a PDF with a silent hole in it.
      if (res.missingGraphics.length > 0) {
        errorMsg = `Preview rendered, but a graphic could not be loaded: ${res.missingGraphics[0]}`;
      }
    } catch (err: any) {
      console.error("Exercise preview failed:", err);
      errorMsg = translate("exercises.editor.previewFailed", { message: err.message || translate("exercises.editor.previewFailedUnknown") });
    } finally {
      isPreviewLoading = false;
    }
  }

  async function handleSaveExercise() {
    // Imported without code: there is nothing to edit, and a save would turn the exercise into an empty one.
    if (editingExercise?.codeWithheld) {
      errorMsg = translate("exam.resultsOnly.noEdit");
      return;
    }
    if (!editorName.trim()) {
      errorMsg = translate("exercises.editor.nameRequired");
      return;
    }

    if (editorQuestionType !== "free_text") {
      if (mcOptions.length < MC_MIN_OPTIONS) {
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
        if ($isAuthenticated) {
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
        onSave?.({ exercise: savedEx, isNewVersion: true });
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

      if ($isAuthenticated) {
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
      onSave?.({ exercise: record, isNewVersion: false });
      forceClose();
    } catch (err: any) {
      errorMsg = translate("exercises.editor.saveFailed", { message: err.message });
    } finally {
      isSaving = false;
    }
  }

  const editorColumnBase =
    "flex flex-col h-full min-h-0 overflow-hidden rounded-md border border-line bg-surface-sunken transition-all duration-200";
  // Below `@3xl` this column stacks above DualPdfPreview (which has its own 18rem floor);
  // `overflow-hidden` zeroes this column's auto minimum, so it needs a matching floor on phones.
  let editorColumnClass = $derived(showLatexPanel
    ? `${editorColumnBase} min-h-80 flex-1 min-w-0 p-0 gap-0 @3xl:min-h-0`
    : `${editorColumnBase} w-full h-10 flex-none min-w-0 p-0 @3xl:h-full @3xl:w-10 @3xl:min-w-10`);

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
</script>

{#if isOpen}
  <Modal open={isOpen} size="full" tall bare onClose={requestClose} labelledBy="exercise-editor-title">
    {#snippet header()}
      <div class="flex min-w-0 items-center gap-2">
        <h2 id="exercise-editor-title" class="m-0 truncate text-xl font-semibold text-content">
          {isCreatingVersion
            ? $t("exercises.editor.titleNewVersion", { name: editorName })
            : editingExercise
              ? $t("exercises.editor.titleEdit", { name: editorName })
              : $t("exercises.editor.titleCreate")}
        </h2>
        {#if isCreatingVersion}
          <Badge severity="primary">v{(versionBaseEx?.version || 1) + 1}</Badge>
        {/if}
      </div>
    {/snippet}

    <div class="flex h-full max-h-full w-full flex-col overflow-hidden">
      <div class="shrink-0 border-b border-line px-4 pb-3">
        <div class="flex flex-wrap items-center gap-3 rounded-md border border-line bg-surface-sunken px-3 py-2">
          {#if editingExercise || isCreatingVersion}
            <div class="flex flex-wrap items-center gap-2 text-sm">
              <span class="text-xs text-muted">{$t("exercises.editor.groupLabel")}</span>
              <strong class="font-semibold text-content">{editorName}</strong>
              <Badge icon={faTag}>{editorTopicTag}</Badge>
              {#if editorGrade}
                <Badge>{$t("exercises.editor.gradeBadge", { grade: editorGrade })}</Badge>
              {/if}
              {#if editorSubject}
                <Badge icon={faBook}>{editorSubject}</Badge>
              {/if}
            </div>

            <div class="flex items-center gap-1.5 text-xs">
              <label for="editorVariantKey" class="whitespace-nowrap font-semibold text-muted">{$t("exercises.editor.variantKeyLabel")}</label>
              <TextInput
                id="editorVariantKey"
                size="sm"
                bind:value={editorVariantKey}
                placeholder={$t("exercises.editor.variantKeyPlaceholder")}
              />
            </div>
          {:else}
            <div class="flex w-full flex-wrap items-center gap-3">
              <div class="flex items-center gap-1.5 text-xs">
                <label for="editorName" class="whitespace-nowrap font-semibold text-muted">{$t("exercises.editor.nameLabel")}</label>
                <TextInput
                  id="editorName"
                  size="sm"
                  bind:value={editorName}
                  required
                  placeholder={$t("exercises.editor.namePlaceholder")}
                />
              </div>

              <div class="flex items-center gap-1.5 text-xs">
                <label for="editorTopic" class="whitespace-nowrap font-semibold text-muted">{$t("exercises.editor.topicLabel")}</label>
                <SuggestInput
                  id="editorTopic"
                  storageKey="exercise.topic"
                  bind:value={editorTopicTag}
                  placeholder="_Vererbung"
                  required
                  class="{controlClass} {controlSmClass}"
                />
              </div>

              <div class="flex items-center gap-1.5 text-xs">
                <label for="editorGrade" class="whitespace-nowrap font-semibold text-muted">{$t("exercises.editor.gradeLabel")}</label>
                <SuggestInput
                  id="editorGrade"
                  storageKey="exercise.grade"
                  bind:value={editorGrade}
                  placeholder={$t("exercises.editor.gradePlaceholder")}
                  class="{controlClass} {controlSmClass}"
                />
              </div>

              <div class="flex items-center gap-1.5 text-xs">
                <label for="editorSubject" class="whitespace-nowrap font-semibold text-muted">{$t("exercises.editor.subjectLabel")}</label>
                <SuggestInput
                  id="editorSubject"
                  storageKey="exercise.subject"
                  bind:value={editorSubject}
                  placeholder={$t("exercises.editor.subjectPlaceholder")}
                  class="{controlClass} {controlSmClass}"
                />
              </div>

              <div class="flex items-center gap-1.5 text-xs">
                <label for="editorVariantKey" class="whitespace-nowrap font-semibold text-muted">{$t("exercises.editor.variantKeyLabelPlain")}</label>
                <TextInput
                  id="editorVariantKey"
                  size="sm"
                  bind:value={editorVariantKey}
                  placeholder={$t("exercises.editor.variantKeyPlaceholderPlain")}
                />
              </div>

              <div class="flex items-center gap-1.5 text-xs">
                <span class="whitespace-nowrap font-semibold text-muted">{$t("exercises.editor.exerciseTypeLabel")}</span>
                <div class="inline-flex gap-1 rounded-md border border-line bg-surface-sunken p-0.5">
                  <Button
                    size="sm"
                    variant={editorQuestionType === "free_text" ? "solid" : "text"}
                    severity={editorQuestionType === "free_text" ? "primary" : "secondary"}
                    pressed={editorQuestionType === "free_text"}
                    onClick={() => {
                      editorQuestionType = "free_text";
                      handleQuestionTypeChange();
                    }}
                  >{$t("exercises.editor.freeTextButton")}</Button>
                  <Button
                    size="sm"
                    variant={editorQuestionType === "mc" ? "solid" : "text"}
                    severity={editorQuestionType === "mc" ? "primary" : "secondary"}
                    pressed={editorQuestionType === "mc"}
                    onClick={() => {
                      editorQuestionType = "mc";
                      handleQuestionTypeChange();
                    }}
                  >{$t("exercises.editor.mcButton")}</Button>
                </div>
              </div>
            </div>
          {/if}
        </div>
      </div>

      {#if errorMsg}
        <Alert severity="danger" class="mx-4 mt-3 shrink-0">
          <div class="max-h-52 overflow-y-auto whitespace-pre-wrap break-all font-mono">{errorMsg}</div>
        </Alert>
      {/if}

      <div class="flex min-h-0 flex-1 flex-col gap-4 p-4 @3xl:flex-row @3xl:overflow-hidden">
        <div class={editorColumnClass}>
          {#if showLatexPanel}
            <div class="flex w-full shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-raised px-3 py-2">
              <button
                type="button"
                class="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 text-left"
                onclick={handleToggleLatex}
                title={$t("exercises.editor.collapseLatexTitle")}
              >
                <span class="whitespace-nowrap text-sm font-semibold text-content">{$t("exercises.editor.latexSourceCodeLabel")}</span>
                <Badge severity="primary" size="xs">
                  {$t("exercises.editor.autoScoreLabel", { score: parseExerciseScore(editorLatexBody) })}
                </Badge>
                <Icon icon={faChevronRight} class="shrink-0 text-muted group-hover:text-accent" />
              </button>
              <Button
                size="sm"
                onClick={handlePreviewExercise}
                disabled={isPreviewLoading}
                title={$t("exercises.editor.previewButtonTitle")}
              >{isPreviewLoading ? $t("exercises.editor.previewButtonLoading") : $t("exercises.editor.previewButton")}</Button>
            </div>

            <div class="flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden p-2">
              {#if editorQuestionType !== "free_text"}
                <div class="flex flex-col gap-3 rounded-md border border-line bg-surface-raised p-3 text-xs">
                  <div class="flex flex-wrap items-center justify-between gap-x-3">
                    <h3 class="m-0 text-sm font-semibold text-content">
                      {$t("exercises.editor.mcEditorTitle")}
                    </h3>
                    <span class="text-xs text-muted">
                      {$t("exercises.editor.mcEditorHint")}
                    </span>
                  </div>

                  <div class="flex flex-col gap-1">
                    <span class="font-semibold text-content">{$t("exercises.editor.mcQuestionTextLabel")}</span>
                    <LatexEditor
                      bind:value={mcQuestionText}
                      rows={4}
                      showQuickInsert
                      onChange={regenerateMcLatex}
                    />
                  </div>

                  <div class="flex flex-col gap-1">
                    <label class="flex items-center gap-1.5 font-semibold text-content" for="mc-penalty">
                      {$t("exercises.editor.mcPenaltyLabel")}
                      <InfoTip text={$t("help.tips.mcPenalty")} topic="exercises" />
                    </label>
                    <input
                      id="mc-penalty"
                      type="number"
                      step="0.25"
                      min="0"
                      bind:value={editorPenalty}
                      class="{controlClass} {controlSmClass} w-24"
                    />
                  </div>

                  <div class="flex flex-col gap-1">
                    <label class="font-semibold text-content" for="mc-columns">{$t("exercises.editor.mcColumnsLabel")}</label>
                    <Select id="mc-columns" size="sm" class="w-full @xl:w-72" bind:value={mcColumns} onchange={regenerateMcLatex}>
                      <option value="auto">{$t("exercises.editor.mcColumnsAuto", { max: MC_MAX_COLUMNS })}</option>
                      {#each MC_COLUMN_CHOICES as choice}
                        <option value={choice}>{choice}</option>
                      {/each}
                    </Select>
                  </div>

                  <div class="flex flex-col gap-2">
                    <div class="flex items-center justify-between font-semibold text-content">
                      <span>{$t("exercises.editor.mcOptionsLabel", { count: mcOptions.length })}</span>
                      <Button
                        size="sm"
                        icon={faPlus}
                        onClick={addMcOption}
                        disabled={mcOptions.length >= MC_MAX_OPTIONS}
                      >{$t("exercises.editor.mcAddOptionButton")}</Button>
                    </div>

                    {#each mcOptions as option, index}
                      <div class="flex items-center gap-2 rounded-md border border-line bg-surface-sunken p-2">
                        <Checkbox
                          checked={option.correct}
                          onChange={() => toggleOptionCorrect(index)}
                          title={$t("exercises.editor.mcOptionCorrectTitle")}
                          aria-label={$t("exercises.editor.mcOptionCorrectTitle")}
                        />

                        <input
                          type="text"
                          value={option.text}
                          oninput={(e) => updateOptionText(index, e.currentTarget.value)}
                          placeholder={$t("exercises.editor.mcOptionPlaceholder", { number: index + 1 })}
                          class="{controlClass} {controlSmClass} flex-1"
                        />

                        <Badge size="xs" severity={option.correct ? "success" : "secondary"}>
                          {option.correct ? $t("exercises.editor.mcOptionCorrect") : $t("exercises.editor.mcOptionIncorrect")}
                        </Badge>

                        <Button
                          variant="text"
                          severity="secondary"
                          size="sm"
                          iconOnly
                          icon={faXmark}
                          onClick={() => removeMcOption(index)}
                          disabled={mcOptions.length <= MC_MIN_OPTIONS}
                          title={$t("exercises.editor.mcOptionRemoveTitle")}
                          ariaLabel={$t("exercises.editor.mcOptionRemoveTitle")}
                        />
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}
              <div class="flex items-center justify-between px-1 text-xs">
                <span class="font-semibold text-content">{$t("exercises.editor.latexPreviewLabel")}</span>
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
        />
      </div>
    </div>

    {#snippet footer()}
      <Button variant="outlined" severity="secondary" onClick={requestClose}>{$t("common.cancel")}</Button>
      <Button onClick={handleSaveExercise} disabled={isSaving || !!editingExercise?.codeWithheld}>
        {isSaving
          ? $t("exercises.editor.saveButtonSaving")
          : isCreatingVersion
            ? $t("exercises.editor.saveButtonNewVersion")
            : $t("exercises.editor.saveButton")}
      </Button>
    {/snippet}
  </Modal>
{/if}

<ConfirmDialog
  open={showConfirmClose}
  title={$t("exercises.editor.discardTitle")}
  message={$t("exercises.editor.discardMessage")}
  confirmText={$t("exercises.confirmDiscard.confirmText")}
  cancelText={$t("exercises.confirmDiscard.cancelText")}
  severity="danger"
  role="dialog"
  onConfirm={forceClose}
  onCancel={() => (showConfirmClose = false)}
/>
