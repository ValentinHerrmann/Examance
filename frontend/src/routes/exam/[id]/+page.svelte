<script lang="ts">
  import { resultsAreLocal } from "#lib/stores/storagePolicy";
  import { type ExerciseGroup, groupExercises } from "#lib/exercise-library/groupExercises";
  import { page } from "$app/state";
  import { onMount, onDestroy, untrack } from "svelte";
  import { browser } from "$app/env";
  import { db } from "#lib/db/db";
  import type {
    ExamRecord,
    ExerciseRecord,
    SubmissionRecord,
    ExamMcGroupRecord,
    ExamExerciseRecord,
  } from "#lib/db/schema";
  import {
    loadExamEncrypted,
    saveExamEncrypted,
    loadExamExercisesEncrypted,
    loadExercisesEncrypted,
    loadStudentsEncrypted,
    loadSubmissionsEncrypted,
    decryptExercise,
    decryptSubmission,
    decryptStudent,
    encryptExercise,
    loadOmrTemplateEncrypted,
    loadLocalMcGroups,
    type McGroup,
  } from "#lib/db/dbEncryption";
  import { computeMcExercisesHash, resolveMcExercises } from "#lib/grading/mcExerciseHash";
  import { prepareOmrTemplate } from "#lib/grading/omrTemplatePrep";
  import { isMcQuestion } from "#lib/grading/mcScore";
  import { exportArchiveInteractively } from "#lib/services/archiveService";
  import { getLatestForSlot, invalidateOwner } from "#lib/latex/compileCache";
  import { parseExerciseScore } from "#lib/latex/scoreParser";
  import { compileExamPreview } from "#lib/exam/examPreview";
  import { pdfBytesToUrl } from "#lib/latex/pdfPreview";
  import { api } from "#lib/api/client";
  import { submissionRepository } from "#lib/repositories/submissionRepository";
  import { studentRepository } from "#lib/repositories/studentRepository";
  import { examRepository, mapApiToExamRecord } from "#lib/repositories/examRepository";
  import { mapExerciseRecordToApi } from "#lib/repositories/exerciseRepository";
  import { uint8ArrayToBase64, decrypt } from "#lib/crypto/aesGcm";
  import { ensure64CharHex } from "#lib/crypto/hmac";
  import type {
    OmrWorkerRequest,
    OmrWorkerResponse,
    OmrExerciseAnswerKey,
  } from "#lib/workers/omrWorker";
  import { sessionStore, isAuthenticated, awaitSessionReady } from "#lib/stores/session";
  import { get } from "svelte/store";
  import DualPdfPreview from "#lib/components/DualPdfPreview.svelte";
  import { getPresetCutoffs } from "#lib/analytics/gradingKey";
  import type { GradingKeyConfig } from "#lib/db/schema";
  import { goto } from "$app/navigation";
  import ExamMetadata from "#lib/components/exam/ExamMetadata.svelte";
  import ExamActionBar from "#lib/components/exam/ExamActionBar.svelte";
  import ExerciseList from "#lib/components/exam/ExerciseList.svelte";
  import ExamMetadataEditor from "#lib/components/exam/ExamMetadataEditor.svelte";
  import { setExamLogo, type ExamLogoChange } from "#lib/latex/logo";
  import ExamLibraryModal from "#lib/components/exam/ExamLibraryModal.svelte";
  import { mapApiToExerciseRecord } from "#lib/repositories/exerciseRepository";
  import {
    applyGroup,
    buildMcGroupMembership,
    canFinalizeGroup,
    moveStaged,
    toggleStaged,
  } from "#lib/exam/mcGroupStaging";
  import { t, translate } from "#lib/i18n";
  import { exerciseTopicSuggestions } from "#lib/utils/examLabel";
  import { ConfirmDialog, Alert, Button, Card, PageHeader, PageShell } from "#lib/components/ui";

  let examId = $derived(page.params.id || "");

  interface ExamItemRef {
    type: "exercise" | "mc_group";
    id: string;
  }

  // Raw: these records go to Dexie, encryption, the API and buildExamLinkPayload(); update immutably.
  let exam: ExamRecord | null = $state.raw(null);
  let exercises: ExerciseRecord[] = $state.raw([]);
  let mcGroups: McGroup[] = $state.raw([]);
  let examItems: ExamItemRef[] = $state.raw([]);
  let submissions: SubmissionRecord[] = $state.raw([]);

  let isExporting = false;
  let exportSuccess = $state(false);

  let isPreviewLoading = $state(false);
  let compileNotice = $state("");
  let errorMsg = $state("");

  let isPreparingOmr = $state(false);
  let omrPrepareMessage = $state("");
  let omrTemplateStatus: "none" | "ready" | "stale" | "checking" = $state("checking");

  let previewPdfUrl: string | null = $state(null);
  let previewSolutionPdfUrl: string | null = $state(null);
  let showAngabePreview = $state(true);
  let showLoesungPreview = $state(false);

  function restoreCachedPreviews(id: string) {
    if (!previewPdfUrl) {
      const cachedAngabe = getLatestForSlot({ kind: "exam", id, variant: "angabe" });
      if (cachedAngabe) {
        const blobAngabe = new Blob([cachedAngabe.pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
        previewPdfUrl = URL.createObjectURL(blobAngabe);
      }
    }
    if (!previewSolutionPdfUrl) {
      const cachedLoesung = getLatestForSlot({ kind: "exam", id, variant: "loesung" });
      if (cachedLoesung) {
        const blobLoesung = new Blob([cachedLoesung.pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
        previewSolutionPdfUrl = URL.createObjectURL(blobLoesung);
      }
    }
  }

  onDestroy(() => {
    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
      previewPdfUrl = null;
    }
    if (previewSolutionPdfUrl) {
      URL.revokeObjectURL(previewSolutionPdfUrl);
      previewSolutionPdfUrl = null;
    }
  });

  let isLocalFallback = $state(false);
  let isSyncingSingle = $state(false);

  // Only the newest loadExam() run may write: interleaved runs each delete and re-write this exam's
  // examMcGroups/examExercises rows, which left the local MC groups empty.
  let loadSeq = 0;

  /** Rebuilds the item order from persisted order indices ("exercises, then groups" moved every MC
   *  group to the bottom on re-open). Members share their group's order index and are not emitted alone. */
  function buildExamItems(exs: ExerciseRecord[], groups: McGroup[]): ExamItemRef[] {
    const memberIds = new Set(groups.flatMap((g) => g.memberIds));
    const entries: { order: number; item: ExamItemRef }[] = [];

    exs.forEach((ex, idx) => {
      if (memberIds.has(ex.id)) return;
      entries.push({ order: ex.orderIndex ?? idx + 1, item: { type: "exercise", id: ex.id } });
    });

    groups.forEach((g, idx) => {
      const memberOrders = g.memberIds
        .map((id) => exs.find((e) => e.id === id)?.orderIndex)
        .filter((o): o is number => typeof o === "number");
      const order =
        g.orderIndex ??
        (memberOrders.length > 0 ? Math.min(...memberOrders) : exs.length + idx + 1);
      entries.push({ order, item: { type: "mc_group", id: g.id } });
    });

    return entries
      .map((entry, idx) => ({ ...entry, idx }))
      .sort((a, b) => a.order - b.order || a.idx - b.idx)
      .map((entry) => entry.item);
  }

  function mapRemoteMcGroups(rawGroups: any[]): McGroup[] {
    return rawGroups.map((g: any, idx: number) => ({
      id: g.id,
      title: g.title,
      scoringText: g.scoring_text ?? g.scoringText,
      memberIds: (g.member_ids || g.members || []).map((m: any) =>
        typeof m === "string" ? m : m.id,
      ),
      orderIndex: g.order_index ?? g.orderIndex ?? idx + 1,
    }));
  }

  async function loadExam(id: string) {
    await awaitSessionReady();
    const seq = ++loadSeq;
    const isStale = () => seq !== loadSeq;
    const key = get(sessionStore).sessionKey;
    try {
      if ($isAuthenticated) {
        try {
          const remoteExam = (await api.get(`/exams/${id}`)) as any;
          if (isStale()) return;
          exam = mapApiToExamRecord(remoteExam);
          exercises = remoteExam.exercises.map(mapApiToExerciseRecord);
          // Only a response that actually carries `mc_groups` may rewrite
          // local grouping — otherwise this would replace every junction's
          // mcGroupId with undefined and dissolve the groups.
          const groupsAreAuthoritative = Array.isArray(remoteExam.mc_groups);

          if (groupsAreAuthoritative) {
            mcGroups = mapRemoteMcGroups(remoteExam.mc_groups);
            const mcGroupRecords = mcGroups.map((g, idx) => ({
              id: g.id,
              examId: id,
              title: g.title,
              scoringText: g.scoringText,
              orderIndex: g.orderIndex ?? idx + 1,
            }));
            if (isStale()) return;
            await db.transaction("rw", db.examMcGroups, async () => {
              await db.examMcGroups.where("examId").equals(id).delete();
              if (mcGroupRecords.length > 0) {
                await db.examMcGroups.bulkPut(mcGroupRecords);
              }
            });
          } else {
            mcGroups = await loadLocalMcGroups(id);
            if (isStale()) return;
          }
          if (exercises.length > 0) {
            const encExs = await Promise.all(exercises.map((ex: any) => encryptExercise(ex, key)));
            // When the response said nothing about groups, membership comes from
            // the rows we already hold rather than from the response's silence.
            const storedLinks = groupsAreAuthoritative
              ? new Map<string, ExamExerciseRecord>()
              : new Map(
                  (await db.examExercises.where("examId").equals(id).toArray()).map(
                    (link) => [link.exerciseId, link],
                  ),
                );
            const junctions = exercises.map((ex: any, idx: number) => {
              const stored = storedLinks.get(ex.id);
              return {
                examId: id,
                exerciseId: ex.id,
                orderIndex: ex.orderIndex || (idx + 1),
                mcGroupId: ex.mcGroupId ?? stored?.mcGroupId,
                subIndex: ex.subIndex ?? stored?.subIndex,
              };
            });
            if (isStale()) return;
            await db.transaction("rw", [db.exercises, db.examExercises], async () => {
              await db.exercises.bulkPut(encExs);
              // Replace, don't merge: a link the server dropped must not survive
              // locally and reappear as a phantom exercise on the next open.
              await db.examExercises.where("examId").equals(id).delete();
              await db.examExercises.bulkPut(junctions);
            });
          } else {
            const localExs = await loadExamExercisesEncrypted(id, key);
            if (isStale()) return;
            if (localExs.length > 0) {
              exercises = localExs;
            }
          }
          isLocalFallback = false;
        } catch (serverErr) {
          // Fall back to IndexedDB if exam is not on server
          const localExam = (await loadExamEncrypted(id, key)) || null;
          if (isStale()) return;
          exam = localExam;
          if (exam) {
            isLocalFallback = true;
            exercises = await loadExamExercisesEncrypted(id, key);
            mcGroups = await loadLocalMcGroups(id);
            if (isStale()) return;
          } else {
            errorMsg = translate("exam.page.examNotFoundOrDeleted");
            console.error("Exam not found on server or locally:", serverErr);
          }
        }
      } else {
        isLocalFallback = false;
        const localExam = (await loadExamEncrypted(id, key)) || null;
        const localExercises = await loadExamExercisesEncrypted(id, key);
        const localGroups = await loadLocalMcGroups(id);
        if (isStale()) return;
        exam = localExam;
        exercises = localExercises;
        mcGroups = localGroups;
      }
      examItems = buildExamItems(exercises, mcGroups);
      if (browser && key) {
        try {
          libraryExercises = await loadExercisesEncrypted(key);
        } catch {}
      }
      const loadedSubmissions = await submissionRepository.getByExamId(id, key);
      if (isStale()) return;
      submissions = loadedSubmissions;
      await checkOmrTemplateStatus(id);
    } catch (err) {
      console.error("Failed to load exam from DB:", err);
    }
  }

  /** MC exercises in exam order from one merged lookup (`exercises` wins over `libraryExercises`), so the
   *  answer-key hash is stable across calls and no spurious "stale" banner appears. */
  function collectMcExercises(): ExerciseRecord[] {
    return resolveMcExercises(exercises, libraryExercises, mcGroups);
  }

  /** Answer-key hash shared with the scan-ingest check (mcExerciseHash.ts). Detects a stale OMR
   *  template after an answer-key edit; never used to silently regenerate one. */
  async function computeExercisesHash(): Promise<string> {
    return computeMcExercisesHash(collectMcExercises(), mcGroups);
  }

  async function checkOmrTemplateStatus(id: string) {
    omrTemplateStatus = "checking";
    try {
      const mcExercises = collectMcExercises();
      if (mcExercises.length === 0) {
        omrTemplateStatus = "none";
        return;
      }
      const key = get(sessionStore).sessionKey;
      const existing = await loadOmrTemplateEncrypted(id, key);
      if (!existing || !existing.payload) {
        omrTemplateStatus = "none";
        return;
      }
      const currentHash = await computeExercisesHash();
      omrTemplateStatus = existing.record.exercisesHash === currentHash ? "ready" : "stale";
    } catch (err) {
      console.error("Failed to check OMR template status:", err);
      omrTemplateStatus = "none";
    }
  }

  async function syncCurrentExamToServer() {
    if (!exam) return;
    isSyncingSingle = true;
    try {
      // 1. Exercises first: links reference them. POST is create-only (409 on a known id), so fall
      //    back to PATCH; silentError keeps these expected conflicts out of the global error modal.
      for (const ex of exercises) {
        const exercisePayload = mapExerciseRecordToApi(ex);
        try {
          await api.post("/exercises", exercisePayload, { silentError: true });
        } catch (err: any) {
          if (err?.status === 409) {
            const { id: _ignored, ...patchPayload } = exercisePayload;
            try {
              await api.patch(`/exercises/${ex.id}`, patchPayload, { silentError: true });
            } catch (patchErr) {
              // A published exercise owned by someone else is read-only for us.
              // It is already on the server, which is all the links need.
              console.warn("Could not update exercise on server:", ex.id, patchErr);
            }
          } else {
            console.warn("Could not push exercise to server:", ex.id, err);
          }
        }
      }

      // 2. Push the exam with its links. One payload, built from the same
      //    helper the incremental save uses, so an exercise is never listed
      //    both standalone and as an MC group member.
      const { mcGroupsPayload, exerciseLinksPayload } = buildExamLinkPayload();
      const examPayload = {
        title: exam.title || translate("exam.page.untitledExam"),
        testart: exam.testart,
        grade: exam.grade,
        klasse: exam.klasse,
        datum: exam.datum,
        nr: exam.nr,
        fach: exam.fach,
        topic: exam.topic,
        lehrernachname: exam.lehrernachname,
        info_text: exam.infoText,
        latex_template: exam.latexTemplate,
        retention_until:
          exam.retentionUntil ||
          new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
        mc_groups: mcGroupsPayload,
        exercise_links: exerciseLinksPayload,
      };
      try {
        await api.post("/exams", { id: exam.id, ...examPayload }, { silentError: true });
      } catch (err: any) {
        if (err?.status !== 409) throw err;
        await api.patch(`/exams/${exam.id}`, examPayload, { silentError: true });
      }

      // 3. Post students. Only in all-server mode: in hybrid the results belong in this browser, and
      // moving them is the results mover's job, never a side effect of syncing the exam.
      const uploadResults = !resultsAreLocal();
      const localStudents = uploadResults
        ? await db.students.where("examId").equals(exam.id).toArray()
        : [];
      for (const st of localStudents) {
        try {
          const ct = st.payloadCt || st.piiCt || new Uint8Array([0]);
          const iv = st.payloadIv || st.piiIv || new Uint8Array(12);
          const ctB64 = uint8ArrayToBase64(ct);
          const ivB64 = uint8ArrayToBase64(iv);
          const emptySaltB64 = uint8ArrayToBase64(new Uint8Array(16));
          const pseudonymHmac = await ensure64CharHex(st.pseudonymId);
          await api.post(`/exams/${exam.id}/students`, {
            pseudonym_hmac: pseudonymHmac,
            pii_ciphertext_b64: ctB64,
            iv_b64: ivB64,
            encryption_salt_b64: emptySaltB64,
          }, { silentError: true });
        } catch {}
      }

      // 4. Post submissions (all-server mode only, as above)
      const localSubmissions = uploadResults
        ? await db.submissions.where("examId").equals(exam.id).toArray()
        : [];
      for (const sub of localSubmissions) {
        try {
          const pseudonymHmac = await ensure64CharHex(sub.pseudonymHash);
          await api.post(`/exams/${exam.id}/submissions`, {
            id: sub.id,
            pseudonym_hmac: pseudonymHmac,
            total_score: sub.totalScore ?? null,
            scan_ciphertext_b64: sub.scanCt
              ? uint8ArrayToBase64(sub.scanCt)
              : undefined,
            scan_iv_b64: sub.scanIv
              ? uint8ArrayToBase64(sub.scanIv)
              : undefined,
            annotation_ciphertext_b64: sub.annotationCt
              ? uint8ArrayToBase64(sub.annotationCt)
              : undefined,
            annotation_iv_b64: sub.annotationIv
              ? uint8ArrayToBase64(sub.annotationIv)
              : undefined,
          }, { silentError: true });
        } catch {}
      }

      isLocalFallback = false;
      alert(translate("exam.page.sync.success"));
    } catch (err: any) {
      alert(translate("exam.page.sync.failed", { message: err.message }));
    } finally {
      isSyncingSingle = false;
    }
  }

  async function handleDeleteExam() {
    if (!exam) return;
    if (
      !confirm(
        translate("exam.page.delete.confirmMessage", { title: exam.title }),
      )
    )
      return;

    try {
      // One cascade, shared with the dashboard and the repository, so no
      // owned table is missed.
      await examRepository.delete(exam.id);

      window.location.href = "/";
    } catch (err: any) {
      alert(translate("exam.page.delete.failed", { message: err.message }));
    }
  }

  async function handleExportArchive() {
    isExporting = true;
    try {
      exportSuccess = await exportArchiveInteractively(`${exam?.title || "exam"}.bgproj`);
    } finally {
      isExporting = false;
    }
  }

  async function removeMcGroup(groupId: string) {
    mcGroups = mcGroups.filter((g) => g.id !== groupId);
    await saveExerciseLinks();
  }

  async function handlePrepareOmr() {
    if (!exam) return;
    isPreparingOmr = true;
    errorMsg = "";

    try {
      const result = await prepareOmrTemplate({
        examId: exam.id,
        exam,
        exercises,
        libraryExercises,
        mcGroups,
        examItems,
        key: get(sessionStore).sessionKey,
        onProgress: (msg) => { omrPrepareMessage = msg; }
      });
      omrTemplateStatus = result.status;
      if (result.status === 'stale') {
        omrPrepareMessage = "";
        errorMsg = result.message;
      } else {
        omrPrepareMessage = result.message;
      }
    } catch (err: any) {
      errorMsg = err.message || translate("exam.page.omr.failedGeneric");
      omrPrepareMessage = "";
    } finally {
      isPreparingOmr = false;
    }
  }

  async function handlePreviewExam() {
    if (!exam || (exercises.length === 0 && mcGroups.length === 0)) return;
    isPreviewLoading = true;
    compileNotice = "";
    errorMsg = "";
    let compileSucceeded = false;

    try {
      const res = await compileExamPreview({
        exam,
        exercises,
        libraryExercises,
        mcGroups,
        examItems,
        key: get(sessionStore).sessionKey,
        onStatus: (status) => {
          if (status === 'downloading') {
            compileNotice = translate("exam.page.preview.loadingCompiler");
          } else if (status === 'compiling') {
            compileNotice = translate("exam.page.preview.compiling");
          }
        },
      });

      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
      previewPdfUrl = pdfBytesToUrl(res.angabe.pdfBytes);
      if (previewSolutionPdfUrl) URL.revokeObjectURL(previewSolutionPdfUrl);
      previewSolutionPdfUrl = pdfBytesToUrl(res.loesung.pdfBytes);

      if (res.missingGraphics.length > 0) {
        errorMsg = translate("common.previewMissingGraphic", { name: res.missingGraphics[0] });
      }

      compileNotice = "";
      compileSucceeded = true;
    } catch (err: any) {
      errorMsg = translate("exam.page.preview.failed", {
        message: err.message || translate("exam.page.preview.unknownError"),
      });
    } finally {
      isPreviewLoading = false;
    }

    // Refresh the OMR template after every successful compile so it never drifts from the layout.
    // Gated on MC exercises: handlePrepareOmr() would otherwise surface an unprompted error.
    if (compileSucceeded && collectMcExercises().length > 0) {
      await handlePrepareOmr();
    }
  }

  let isEditingMetadata = $state(false);
  let editTitle = $state("");
  let editTestart = $state("");
  let editGrade = $state("");
  let editKlasse = $state("");
  let editDatum = $state("");
  let editNr = $state("");
  let editFach = $state("");
  let editTopic = $state("");
  let editLehrernachname = $state("");
  let editInfoText = $state("");
  let editLogoChange: ExamLogoChange | null = $state.raw(null);
  let editRetentionUntil = $state("");
  let editGradingKey: GradingKeyConfig = $state({
    preset: "linear_50",
    cutoffs: getPresetCutoffs("linear_50"),
  });

  let initialMetadata = $state({
    title: "",
    testart: "",
    grade: "",
    klasse: "",
    datum: "",
    nr: "",
    fach: "",
    topic: "",
    lehrernachname: "",
    infoText: "",
    retentionUntil: "",
  });
  let showMetadataConfirm = $state(false);

  let isMetadataDirty = $derived(
    isEditingMetadata &&
      (editTitle !== initialMetadata.title ||
        editTestart !== initialMetadata.testart ||
        editGrade !== initialMetadata.grade ||
        editKlasse !== initialMetadata.klasse ||
        editDatum !== initialMetadata.datum ||
        editNr !== initialMetadata.nr ||
        editFach !== initialMetadata.fach ||
        editTopic !== initialMetadata.topic ||
        editLehrernachname !== initialMetadata.lehrernachname ||
        editInfoText !== initialMetadata.infoText ||
        editLogoChange !== null ||
        editRetentionUntil !== initialMetadata.retentionUntil),
  );

  let totalPoints = $derived(exercises.reduce((sum, ex) => sum + (ex.maxPoints ?? 0), 0));
  let submissionsCount = $derived(submissions.length);
  let studentsCount = $derived(new Set(submissions.map((s) => s.pseudonymHash)).size);
  let gradedCount = $derived(
    submissions.filter((s) => typeof s.totalScore === "number" && !isNaN(s.totalScore)).length,
  );

  let isLibraryModalOpen = $state(false);
  let libraryExercises: ExerciseRecord[] = $state.raw([]);
  let selectedLibraryIds: string[] = $state.raw([]);
  let initialSelectedLibraryIds: string[] = $state.raw([]);
  let showLibraryConfirm = $state(false);
  let librarySearch = $state("");
  let activeVariantPerGroup: Record<string, string> = $state.raw({});

  let isLibraryDirty = $derived(
    isLibraryModalOpen &&
      (selectedLibraryIds.length !== initialSelectedLibraryIds.length ||
        selectedLibraryIds.some((id, i) => id !== initialSelectedLibraryIds[i])),
  );

  let filteredLibrary = $derived(
    libraryExercises.filter((ex) => {
      const matchesGrade = selectedGradeFilter === "ALL" || ex.grade === selectedGradeFilter;
      const matchesSubject = selectedSubjectFilter === "ALL" || ex.subject === selectedSubjectFilter;
      const q = librarySearch.toLowerCase().trim();
      const matchesSearch =
        !q ||
        (ex.name && ex.name.toLowerCase().includes(q)) ||
        (ex.topicTag && ex.topicTag.toLowerCase().includes(q)) ||
        (ex.grade && ex.grade.toLowerCase().includes(q)) ||
        (ex.subject && ex.subject.toLowerCase().includes(q)) ||
        (ex.variantKey && ex.variantKey.toLowerCase().includes(q)) ||
        (ex.latexBody && ex.latexBody.toLowerCase().includes(q));
      return matchesGrade && matchesSubject && matchesSearch;
    }),
  );

  let filteredGroups = $derived(groupExercises(filteredLibrary));

  function setGroupVariant(groupId: string, vKey: string) {
    activeVariantPerGroup = { ...activeVariantPerGroup, [groupId]: vKey };
  }

  function getGroupMemberIds(group: ExerciseGroup): string[] {
    return group.allMembers.map((member) => member.ex.id);
  }

  function selectGroupVariant(group: ExerciseGroup, vKey: string) {
    setGroupVariant(group.groupId, vKey);
  }

  function toggleGroupSelection(group: ExerciseGroup, vKey: string) {
    setGroupVariant(group.groupId, vKey);
    const variantId = group.variants.get(vKey)?.[0]?.ex.id;
    if (!variantId) return;
    if (selectedLibraryIds.includes(variantId)) {
      selectedLibraryIds = selectedLibraryIds.filter((id) => id !== variantId);
      return;
    }
    selectedLibraryIds = [...selectedLibraryIds, variantId];
  }

  function openMetadataEditor() {
    if (!exam) return;
    editTitle = exam.title || "";
    editTestart = exam.testart || "Kurzarbeit";
    editGrade = exam.grade || "";
    editKlasse = exam.klasse || "";
    editDatum = exam.datum || "";
    editNr = exam.nr || "1";
    editFach = exam.fach || "Informatik";
    editTopic = exam.topic || "";
    editLehrernachname = exam.lehrernachname || "";
    editInfoText = exam.infoText || "";
    editRetentionUntil = exam.retentionUntil || "";
    editGradingKey = exam.gradingKey || {
      preset: "linear_50",
      cutoffs: getPresetCutoffs("linear_50"),
    };

    initialMetadata = {
      title: editTitle,
      testart: editTestart,
      grade: editGrade,
      klasse: editKlasse,
      datum: editDatum,
      nr: editNr,
      fach: editFach,
      topic: editTopic,
      lehrernachname: editLehrernachname,
      infoText: editInfoText,
      retentionUntil: editRetentionUntil,
    };
    editLogoChange = null;
    showMetadataConfirm = false;
    isEditingMetadata = true;
  }

  function requestCancelMetadata() {
    if (isMetadataDirty) {
      showMetadataConfirm = true;
    } else {
      forceCancelMetadata();
    }
  }

  function forceCancelMetadata() {
    showMetadataConfirm = false;
    isEditingMetadata = false;
  }

  async function handleSaveMetadata() {
    if (!exam) return;
    // editGradingKey is a deep edit buffer (GradingKeyEditor mutates it); persist a plain copy.
    const gradingKey = $state.snapshot(editGradingKey);
    // Sent even when empty: "" is how the server learns the topic was cleared.
    const topic = editTopic.trim();
    try {
      if ($isAuthenticated) {
        await api.patch(`/exams/${exam.id}`, {
          title: editTitle,
          testart: editTestart,
          grade: editGrade,
          klasse: editKlasse,
          datum: editDatum,
          nr: editNr,
          fach: editFach,
          topic,
          lehrernachname: editLehrernachname,
          info_text: editInfoText,
          grading_key: gradingKey,
          retention_until: editRetentionUntil,
        });
      }

      exam = {
        ...exam,
        title: editTitle,
        testart: editTestart,
        grade: editGrade,
        klasse: editKlasse,
        datum: editDatum,
        nr: editNr,
        fach: editFach,
        topic,
        lehrernachname: editLehrernachname,
        infoText: editInfoText,
        retentionUntil: editRetentionUntil,
        gradingKey,
      };
      const key = get(sessionStore).sessionKey;
      await saveExamEncrypted(exam, key);

      if (editLogoChange) {
        try {
          await setExamLogo(exam.id, editLogoChange.mode, editLogoChange.bytes);
        } catch (err: any) {
          alert(translate("logo.exam.saveFailed", { message: err.message }));
          return;
        }
      }

      forceCancelMetadata();
      alert(translate("exam.page.metadata.saveSuccess"));
    } catch (err: any) {
      alert(translate("exam.page.metadata.saveFailed", { message: err.message }));
    }
  }

  async function openLibraryModal() {
    if (!editingMcGroupId) {
      mcStagingIds = [];
    }
    const key = get(sessionStore).sessionKey;
    try {
      if ($isAuthenticated) {
        const remoteExs = (await api.get("/exercises")) as any[];
        libraryExercises = remoteExs.map(mapApiToExerciseRecord);
      } else {
        libraryExercises = await loadExercisesEncrypted(key);
      }
      // The library selection holds standalone exercises only; group members are
      // managed through their group (MC tab), never ticked as standalone too.
      const groupedIds = new Set(mcGroups.flatMap((g) => g.memberIds));
      selectedLibraryIds = exercises.filter((e) => !groupedIds.has(e.id)).map((e) => e.id);
      initialSelectedLibraryIds = [...selectedLibraryIds];
      activeVariantPerGroup = {};
      for (const ex of exercises) {
        const groupId = ex.exerciseGroupId || `name:${ex.name || "Untitled"}`;
        if (ex.variantKey) {
          activeVariantPerGroup = { ...activeVariantPerGroup, [groupId]: ex.variantKey };
        }
      }
      showLibraryConfirm = false;
      isLibraryModalOpen = true;
    } catch (err) {
      console.error("Failed to load library exercises:", err);
    }
  }

  function requestCloseLibraryModal() {
    if (isLibraryDirty) {
      showLibraryConfirm = true;
    } else {
      forceCloseLibraryModal();
    }
  }

  function forceCloseLibraryModal() {
    showLibraryConfirm = false;
    isLibraryModalOpen = false;
    editingMcGroupId = null;
    mcStagingIds = [];
  }

  let mcStagingIds: string[] = $state.raw([]);
  let editingMcGroupId: string | null = $state(null);
  let selectedGradeFilter = $state("ALL");
  let selectedSubjectFilter = $state("ALL");
  let selectedTopicFilter = $state("ALL");

  let availableGrades = $derived([...new Set(libraryExercises.map((e) => e.grade).filter((g): g is string => Boolean(g)))].sort());
  let availableSubjects = $derived([...new Set(libraryExercises.map((e) => e.subject).filter((s): s is string => Boolean(s)))].sort());
  let availableTopics = $derived([...new Set(libraryExercises.map((e) => e.topicTag).filter((t): t is string => Boolean(t)))].sort());
  let totalVariantsCount = $derived(libraryExercises.length);

  let editingMcGroup = $derived(mcGroups.find((g) => g.id === editingMcGroupId) ?? null);
  let mcGroupMembership = $derived(buildMcGroupMembership(mcGroups, editingMcGroupId));

  function toggleMcStaging(id: string) {
    mcStagingIds = toggleStaged(mcStagingIds, id, mcGroupMembership);
  }

  function reorderMcStaging(index: number, direction: "up" | "down") {
    mcStagingIds = moveStaged(mcStagingIds, index, direction);
  }

  async function finalizeMcGroup(title: string, scoringText: string) {
    if (!canFinalizeGroup(mcStagingIds)) return;
    const memberIds = [...mcStagingIds];
    const previousMemberIds = new Set(editingMcGroup?.memberIds ?? []);
    mcGroups = applyGroup(mcGroups, { editingId: editingMcGroupId, title, scoringText, memberIds });
    adoptGroupMembers(memberIds, previousMemberIds);
    editingMcGroupId = null;
    mcStagingIds = [];
    await saveExerciseLinks();
  }

  /** Syncs `exercises` with a group change: new members are linked only as group members (an exercise is
   *  linked once), and members dropped from an edited group leave the exam. */
  function adoptGroupMembers(memberIds: string[], previousMemberIds: Set<string>) {
    const members = new Set(memberIds);
    const removed = new Set([...previousMemberIds].filter((id) => !members.has(id)));
    const linkedIds = new Set(exercises.map((e) => e.id));
    const added = memberIds
      .filter((id) => !linkedIds.has(id))
      .map((id) => libraryExercises.find((e) => e.id === id))
      .filter((e): e is ExerciseRecord => Boolean(e));
    exercises = [...exercises.filter((e) => !removed.has(e.id)), ...added];
    selectedLibraryIds = selectedLibraryIds.filter((id) => !members.has(id));
    examItems = examItems.filter((item) => !(item.type === "exercise" && members.has(item.id)));
  }

  function editMcGroup(groupId: string) {
    if (!mcGroups.some((g) => g.id === groupId)) return;
    editingMcGroupId = groupId;
    mcStagingIds = [...(mcGroups.find((g) => g.id === groupId)?.memberIds ?? [])];
    openLibraryModal();
  }

  async function moveExamItem(index: number, direction: "up" | "down") {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= examItems.length) return;
    const copy = [...examItems];
    [copy[index], copy[targetIdx]] = [copy[targetIdx], copy[index]];
    examItems = copy;
    await saveExerciseLinks();
  }

  async function moveExerciseOrder(index: number, direction: "up" | "down") {
    await moveExamItem(index, direction);
  }

  async function removeExerciseLink(id: string) {
    exercises = exercises.filter((ex) => ex.id !== id);
    examItems = examItems.filter((item) => !(item.type === "exercise" && item.id === id));
    await saveExerciseLinks();
  }

  function computeExamItems(
    current: ExamItemRef[],
    exs: ExerciseRecord[],
    groups: McGroup[],
  ): ExamItemRef[] {
    const validIds = new Set([...exs.map((e) => e.id), ...groups.map((g) => g.id)]);
    const currentItems = current.filter((item) => validIds.has(item.id));
    const currentItemIds = new Set(currentItems.map((item) => item.id));

    const missingExercises = exs
      .filter((e) => !groups.some((g) => g.memberIds.includes(e.id)) && !currentItemIds.has(e.id))
      .map((e) => ({ type: "exercise" as const, id: e.id }));

    const missingGroups = groups
      .filter((g) => !currentItemIds.has(g.id))
      .map((g) => ({ type: "mc_group" as const, id: g.id }));

    return [...currentItems, ...missingExercises, ...missingGroups];
  }

  function getEffectiveExamItems(): ExamItemRef[] {
    return computeExamItems(examItems, exercises, mcGroups);
  }

  interface ExamLinkPayload {
    mcGroupsPayload: any[];
    exerciseLinksPayload: any[];
    mcGroupRecords: any[];
    examExerciseRecords: any[];
    items: ExamItemRef[];
  }

  /** Single builder for both the Dexie records and the server payload. MC group members are emitted only
   *  under their group: listing them standalone too duplicated the (exam, exercise) primary key. */
  function buildExamLinkPayload(): ExamLinkPayload {
    const currentExamId = exam?.id ?? "";
    const items = getEffectiveExamItems();
    const mcGroupsPayload: any[] = [];
    const exerciseLinksPayload: any[] = [];
    const mcGroupRecords: any[] = [];
    const examExerciseRecords: any[] = [];
    const linkedExerciseIds = new Set<string>();
    let order = 1;

    for (const item of items) {
      if (item.type === "exercise") {
        if (linkedExerciseIds.has(item.id)) continue;
        linkedExerciseIds.add(item.id);
        exerciseLinksPayload.push({ exercise_id: item.id, order_index: order });
        examExerciseRecords.push({
          examId: currentExamId,
          exerciseId: item.id,
          orderIndex: order,
        });
        order++;
      } else if (item.type === "mc_group") {
        const group = mcGroups.find((g) => g.id === item.id);
        if (!group) continue;
        mcGroupsPayload.push({
          id: group.id,
          title: group.title,
          scoring_text: group.scoringText,
          order_index: order,
        });
        mcGroupRecords.push({
          id: group.id,
          examId: currentExamId,
          title: group.title,
          scoringText: group.scoringText,
          orderIndex: order,
        });
        let subIndex = 1;
        for (const exId of group.memberIds) {
          if (linkedExerciseIds.has(exId)) continue;
          linkedExerciseIds.add(exId);
          exerciseLinksPayload.push({
            exercise_id: exId,
            order_index: order,
            mc_group_id: group.id,
            sub_index: subIndex,
          });
          examExerciseRecords.push({
            examId: currentExamId,
            exerciseId: exId,
            orderIndex: order,
            mcGroupId: group.id,
            subIndex,
          });
          subIndex++;
        }
        order++;
      }
    }

    return { mcGroupsPayload, exerciseLinksPayload, mcGroupRecords, examExerciseRecords, items };
  }

  async function saveExerciseLinks() {
    if (!exam) return;
    const currentExamId = exam.id;
    const { mcGroupsPayload, exerciseLinksPayload, mcGroupRecords, examExerciseRecords, items } =
      buildExamLinkPayload();
    examItems = items;

    try {
      // One transaction: this is a delete-then-reinsert of the exam's entire
      // link set, and an interruption between the two would leave the exam
      // with zero exercises and zero MC groups.
      await db.transaction("rw", [db.examExercises, db.examMcGroups], async () => {
        await db.examExercises.where("examId").equals(currentExamId).delete();
        await db.examExercises.bulkPut(examExerciseRecords);

        // Groups after the links: exam_exercises rows reference them.
        await db.examMcGroups.where("examId").equals(currentExamId).delete();
        if (mcGroupRecords.length > 0) {
          await db.examMcGroups.bulkPut(mcGroupRecords);
        }
      });
    } catch (err) {
      console.error("Failed to update local exercise links:", err);
      errorMsg = translate("exam.page.exerciseLinks.saveFailed");
      return;
    }

    try {
      // silentError: the failure is reported inline below, and the global
      // HTTP error modal on top of an autosave is pure noise.
      await api.patch(
        `/exams/${currentExamId}`,
        { mc_groups: mcGroupsPayload, exercise_links: exerciseLinksPayload },
        { silentError: true },
      );
      errorMsg = "";
    } catch (err) {
      console.error("Failed to sync exercise links to server:", err);
      errorMsg = translate("exam.page.exerciseLinks.saveFailed");
    }
  }

  function toggleLibrarySelection(id: string) {
    if (selectedLibraryIds.includes(id)) {
      selectedLibraryIds = selectedLibraryIds.filter((i) => i !== id);
    } else {
      selectedLibraryIds = [...selectedLibraryIds, id];
    }
  }

  async function applyLibrarySelection() {
    const groupedIds = new Set(mcGroups.flatMap((g) => g.memberIds));
    const standalone = selectedLibraryIds
      .filter((id) => !groupedIds.has(id))
      .map((id) => libraryExercises.find((ex) => ex.id === id))
      .filter((ex): ex is ExerciseRecord => Boolean(ex))
      .map((ex, idx) => ({ ...ex, orderIndex: idx + 1 }));
    const groupMembers = exercises.filter((ex) => groupedIds.has(ex.id));

    exercises = [...standalone, ...groupMembers];
    await saveExerciseLinks();
    isLibraryModalOpen = false;
  }

  function handleScan() {
    goto(`/exam/${examId}/scan`);
  }

  function handleGrade() {
    goto(`/exam/${examId}/grade`);
  }

  function handleStats() {
    goto(`/exam/${examId}/stats`);
  }

  let isDeletingAllSubmissions = false;

  async function handleDeleteAllSubmissions() {
    if (!exam) return;
    if (submissions.length === 0) {
      alert(translate("exam.page.submissions.noneToDelete"));
      return;
    }
    if (
      !confirm(
        translate("exam.page.submissions.confirmDeleteAll", { count: submissions.length }),
      )
    )
      return;

    isDeletingAllSubmissions = true;
    try {
      for (const sub of submissions) {
        await submissionRepository.delete(exam.id, sub.id);
        await studentRepository.delete(exam.id, sub.pseudonymHash);
      }
      submissions = await submissionRepository.getByExamId(
        exam.id,
        get(sessionStore).sessionKey,
      );
      alert(translate("exam.page.submissions.allDeleted"));
    } catch (err: any) {
      alert(translate("exam.page.submissions.deleteFailed", { message: err.message }));
    } finally {
      isDeletingAllSubmissions = false;
    }
  }

  // Keeps examItems in step with exercises/mcGroups (drops vanished refs, appends new ones).
  // Shares computeExamItems() with getEffectiveExamItems(), so rendered and stored order agree.
  // Also tracks examItems; it only writes when the result differs, so it settles.
  $effect.pre(() => {
    const items = examItems;
    const nextItems = computeExamItems(items, exercises, mcGroups);
    if (nextItems.length !== items.length || nextItems.some((item, i) => item.id !== items[i]?.id)) {
      untrack(() => (examItems = nextItems));
    }
  });

  $effect.pre(() => {
    const id = examId;
    if (browser && id) {
      untrack(() => {
        loadExam(id);
        restoreCachedPreviews(id);
      });
    }
  });
</script>

<PageShell width="fluid">
  <PageHeader title={$t("exam.sidebar.setup")} />

  {#if isLocalFallback}
    <Alert severity="warning" class="mb-6">
      {$t("exam.page.localFallback.banner")}
      {#snippet actions()}
        <Button
          size="sm"
          variant="outlined"
          severity="warning"
          onClick={syncCurrentExamToServer}
          disabled={isSyncingSingle}
          loading={isSyncingSingle}
        >
          {isSyncingSingle ? $t("exam.page.localFallback.syncing") : $t("exam.page.localFallback.syncNow")}
        </Button>
      {/snippet}
    </Alert>
  {/if}

  {#if exercises.some((ex) => ex.codeWithheld)}
    <!-- Imported from another teacher's results-only archive: grading and statistics work, compiling doesn't. -->
    <Alert severity="info" title={$t("exam.resultsOnly.badge")} class="mb-6">
      {$t("exam.resultsOnly.noCompile")}
    </Alert>
  {/if}

  {#if !exam}
    <div class="text-muted">{$t("exam.page.loading")}</div>
  {:else}
    <ExamMetadata
      {exam}
      {totalPoints}
      {submissionsCount}
      {studentsCount}
      {gradedCount}
    />

    <ExamActionBar
      {examId}
      onEdit={openMetadataEditor}
      onDelete={handleDeleteExam}
      onExport={handleExportArchive}
      onScan={handleScan}
      onGrade={handleGrade}
      onStats={handleStats}
      onDeleteAllSubmissions={handleDeleteAllSubmissions}
    />

    <ExamMetadataEditor
      isOpen={isEditingMetadata}
      bind:editTitle
      bind:editTestart
      bind:editGrade
      bind:editKlasse
      bind:editDatum
      bind:editNr
      bind:editFach
      bind:editTopic
      topicSuggestions={exerciseTopicSuggestions(exercises)}
      bind:editLehrernachname
      bind:editInfoText
      bind:editRetentionUntil
      bind:editGradingKey
      examId={exam?.id}
      bind:logoChange={editLogoChange}
      onSave={handleSaveMetadata}
      onCancel={requestCancelMetadata}
    />

<ConfirmDialog
  open={showMetadataConfirm}
  title={$t("exam.page.metadata.discardTitle")}
  message={$t("exam.page.metadata.discardMessage")}
  confirmText={$t("exam.page.metadata.discardConfirm")}
  cancelText={$t("exam.page.metadata.discardKeepEditing")}
  severity="danger"
  role="dialog"
  onConfirm={forceCancelMetadata}
  onCancel={() => (showMetadataConfirm = false)}
/>

    {#if exportSuccess}
      <Alert severity="success" class="mb-6">{$t("exam.page.export.successBanner")}</Alert>
    {/if}

    <div class="grid min-w-0 grid-cols-1 items-start gap-6 @6xl:grid-cols-2">
      <Card title={$t("exam.page.compileSection.heading")}>
        <p class="mb-4 text-sm text-muted">
          {$t("exam.page.compileSection.description")}
        </p>

        <div class="flex flex-wrap items-center gap-4">
          <Button
            onClick={handlePreviewExam}
            loading={isPreviewLoading || isPreparingOmr}
            disabled={isPreviewLoading || isPreparingOmr || exercises.length === 0}
            title={$t("exam.page.compileSection.liveTooltip")}
          >
            {isPreviewLoading
              ? $t("exam.page.preview.compilingPreviews")
              : isPreparingOmr
                ? $t("exam.page.omr.preparing")
                : $t("exam.page.preview.liveButton")}
          </Button>
        </div>

        {#if omrTemplateStatus === "stale"}
          <Alert severity="warning" class="mt-3">
            {$t("exam.page.omr.staleWarning")}
            {#snippet actions()}
              <Button
                size="sm"
                variant="outlined"
                severity="warning"
                onClick={handlePrepareOmr}
                disabled={isPreparingOmr}
              >
                {isPreparingOmr ? $t("exam.page.omr.refreshing") : $t("exam.page.omr.refreshNow")}
              </Button>
            {/snippet}
          </Alert>
        {/if}
        {#if omrPrepareMessage}
          <Alert severity="info" class="mt-3">{omrPrepareMessage}</Alert>
        {/if}

        {#if previewPdfUrl || previewSolutionPdfUrl}
          <div class="mt-4">
            <DualPdfPreview
              {previewPdfUrl}
              {previewSolutionPdfUrl}
              bind:showAngabePreview
              bind:showLoesungPreview
              titleAngabe={$t("exam.page.pdfPreview.titleAngabe")}
              titleLoesung={$t("exam.page.pdfPreview.titleLoesung")}
              height="550px"
              placeholderText={$t("exam.page.pdfPreview.placeholder")}
            />
          </div>
        {/if}

        {#if compileNotice}
          <Alert severity="info" class="mt-3">{compileNotice}</Alert>
        {/if}
        {#if errorMsg}
          <Alert severity="danger" class="mt-4">
            <div class="max-h-72 overflow-auto font-mono break-all whitespace-pre-wrap">{errorMsg}</div>
          </Alert>
        {/if}
      </Card>

      <ExerciseList
        {exercises}
        {mcGroups}
        {libraryExercises}
        {examItems}
        onRemove={removeExerciseLink}
        onAddExercises={openLibraryModal}
        onMoveUp={(idx) => moveExerciseOrder(idx, "up")}
        onMoveDown={(idx) => moveExerciseOrder(idx, "down")}
        onMoveExamItem={moveExamItem}
        onRemoveMcGroup={removeMcGroup}
        onEditMcGroup={editMcGroup}
      />
    </div>
  {/if}
</PageShell>

<ExamLibraryModal
  isOpen={isLibraryModalOpen}
  {filteredGroups}
  {totalVariantsCount}
  {availableGrades}
  {availableSubjects}
  {availableTopics}
  bind:librarySearch
  bind:selectedGradeFilter
  bind:selectedSubjectFilter
  bind:selectedTopicFilter
  {selectedLibraryIds}
  {activeVariantPerGroup}
  {libraryExercises}
  {mcStagingIds}
  {editingMcGroup}
  {mcGroupMembership}
  onToggleMcStaging={toggleMcStaging}
  onReorderMcStaging={reorderMcStaging}
  onFinalizeMcGroup={finalizeMcGroup}
  onToggleSelection={toggleLibrarySelection}
  onSetGroupVariant={setGroupVariant}
  onApply={applyLibrarySelection}
  onRequestClose={requestCloseLibraryModal}
/>

<ConfirmDialog
  open={showLibraryConfirm}
  title={$t("exam.page.library.discardTitle")}
  message={$t("exam.page.library.discardMessage")}
  confirmText={$t("exam.page.metadata.discardConfirm")}
  cancelText={$t("exam.page.metadata.discardKeepEditing")}
  severity="danger"
  role="dialog"
  onConfirm={forceCloseLibraryModal}
  onCancel={() => (showLibraryConfirm = false)}
/>

