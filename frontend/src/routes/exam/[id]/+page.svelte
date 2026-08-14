<script lang="ts">
  import "./+page.css";
  import { page } from "$app/stores";
  import { loadPdfjs } from "$lib/pdf/pdfjs";
  export let params;
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { db } from "$lib/db/db";
  import type {
    ExamRecord,
    ExerciseRecord,
    SubmissionRecord,
    ExamMcGroupRecord,
    OmrTemplatePayload,
    OmrPageTemplate,
    OmrBubbleRect,
    OmrFiducialRect,
  } from "$lib/db/schema";
  import { formatExamCourse } from "$lib/utils/examLabel";
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
    saveOmrTemplateEncrypted,
    loadScoresEncrypted,
    saveScoreEncrypted,
    loadLocalMcGroups,
    type McGroup,
  } from "$lib/db/dbEncryption";
  import { computeMcExercisesHash, resolveMcExercises, normalizeMcExercise } from "$lib/grading/mcExerciseHash";
  import { isMcQuestion } from "$lib/grading/mcScore";
  import { packProject } from "$lib/archive/packer";
  import { compileLatex } from "$lib/latex/compiler";
  import { formatExerciseLatex, formatMcGroupLatex, parseExerciseScore } from "$lib/latex/scoreParser";
  import { api } from "$lib/api/client";
  import { submissionRepository } from "$lib/repositories/submissionRepository";
  import { studentRepository } from "$lib/repositories/studentRepository";
  import { uint8ArrayToBase64, decrypt } from "$lib/crypto/aesGcm";
  import { ensure64CharHex } from "$lib/crypto/hmac";
  import type {
    OmrWorkerRequest,
    OmrWorkerResponse,
    OmrExerciseAnswerKey,
  } from "$lib/workers/omrWorker";
  import { sessionStore, isAuthenticated } from "$lib/stores/session";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import { get } from "svelte/store";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import DualPdfPreview from "$lib/components/DualPdfPreview.svelte";
  import { getPresetCutoffs } from "$lib/analytics/gradingKey";
  import type { GradingKeyConfig } from "$lib/db/schema";
  import { goto } from "$app/navigation";
  import ExamMetadata from "$lib/components/exam/ExamMetadata.svelte";
  import ExamActionBar from "$lib/components/exam/ExamActionBar.svelte";
  import ExerciseList from "$lib/components/exam/ExerciseList.svelte";
  import ExamMetadataEditor from "$lib/components/exam/ExamMetadataEditor.svelte";
  import ExamLibraryModal from "$lib/components/exam/ExamLibraryModal.svelte";

  $: examId = $page.params.id || "";

  interface ExamItemRef {
    type: "exercise" | "mc_group";
    id: string;
  }

  let exam: ExamRecord | null = null;
  let exercises: ExerciseRecord[] = [];
  let mcGroups: McGroup[] = [];
  let examItems: ExamItemRef[] = [];
  let submissions: SubmissionRecord[] = [];

  $: {
    const validIds = new Set([
      ...exercises.map((e) => e.id),
      ...mcGroups.map((g) => g.id),
    ]);
    const currentItems = examItems.filter((item) => validIds.has(item.id));
    const currentItemIds = new Set(currentItems.map((item) => item.id));

    const missingExercises = exercises
      .filter((e) => !mcGroups.some((g) => g.memberIds.includes(e.id)) && !currentItemIds.has(e.id))
      .map((e) => ({ type: "exercise" as const, id: e.id }));

    const missingGroups = mcGroups
      .filter((g) => !currentItemIds.has(g.id))
      .map((g) => ({ type: "mc_group" as const, id: g.id }));

    if (
      currentItems.length !== examItems.length ||
      missingExercises.length > 0 ||
      missingGroups.length > 0
    ) {
      examItems = [...currentItems, ...missingExercises, ...missingGroups];
    }
  }
  let isExporting = false;
  let exportSuccess = false;

  let isPreviewLoading = false;
  let compileNotice = "";
  let errorMsg = "";

  let isPreparingOmr = false;
  let omrPrepareMessage = "";
  let omrTemplateStatus: "none" | "ready" | "stale" | "checking" = "checking";
  let isRerunningMc = false;
  let rerunMcMessage = "";

  let previewPdfUrl: string | null = null;
  let previewSolutionPdfUrl: string | null = null;
  let showAngabePreview = true;
  let showLoesungPreview = false;

  $: if (browser && examId) {
    loadExam(examId);
  }

  let isLocalFallback = false;
  let isSyncingSingle = false;

  async function loadExam(id: string) {
    const key = get(sessionStore).sessionKey;
    try {
      if ($isAuthenticated && $storagePolicyStore.storageMode !== "all-local") {
        try {
          const remoteExam = (await api.get(`/exams/${id}`)) as any;
          exam = {
            id: remoteExam.id,
            teacherId: remoteExam.teacher_id,
            title: remoteExam.title,
            testart: remoteExam.testart,
            grade: remoteExam.grade,
            klasse: remoteExam.klasse,
            datum: remoteExam.datum,
            nr: remoteExam.nr,
            fach: remoteExam.fach,
            lehrernachname: remoteExam.lehrernachname,
            infoText: remoteExam.info_text,
            retentionUntil: remoteExam.retention_until,
            compilationStatus: remoteExam.compilation_status,
            createdAt: remoteExam.created_at,
          };
          exercises = remoteExam.exercises.map((e: any) => normalizeMcExercise({
            id: e.id,
            name: e.name,
            topicTag: e.topic_tag,
            latexBody: e.latex_body,
            maxPoints: e.max_points,
            version: e.version || 1,
            orderIndex: e.order_index,
            questionType: e.question_type || "free_text",
            options: e.options,
            correctAnswers: e.correct_answers || e.correctAnswers,
            penalty: e.penalty || 0,
            mcGroupId: e.mc_group_id || undefined,
            subIndex: e.sub_index || undefined,
          }));
          if (remoteExam.mc_groups && Array.isArray(remoteExam.mc_groups)) {
            mcGroups = remoteExam.mc_groups.map((g: any) => ({
              id: g.id,
              title: g.title,
              scoringText: g.scoring_text,
              memberIds: (g.member_ids || g.members || []).map((m: any) => typeof m === "string" ? m : m.id),
            }));
            const mcGroupRecords = mcGroups.map((g, idx) => ({
              id: g.id,
              examId: id,
              title: g.title,
              scoringText: g.scoringText,
              orderIndex: g.orderIndex || (idx + 1),
            }));
            await db.examMcGroups.where("examId").equals(id).delete();
            if (mcGroupRecords.length > 0) {
              await db.examMcGroups.bulkPut(mcGroupRecords);
            }
          } else {
            mcGroups = await loadLocalMcGroups(id);
          }
          if (exercises.length > 0) {
            const encExs = await Promise.all(exercises.map((ex: any) => encryptExercise(ex, key)));
            await db.exercises.bulkPut(encExs);
            const junctions = exercises.map((ex: any, idx: number) => ({
              examId: id,
              exerciseId: ex.id,
              orderIndex: ex.orderIndex || (idx + 1),
              mcGroupId: ex.mcGroupId || undefined,
              subIndex: ex.subIndex || undefined,
            }));
            await db.examExercises.bulkPut(junctions);
          } else {
            const localExs = await loadExamExercisesEncrypted(id, key);
            if (localExs.length > 0) {
              exercises = localExs;
            }
          }
          isLocalFallback = false;
        } catch (serverErr) {
          // Fall back to IndexedDB if exam is not on server
          exam = (await loadExamEncrypted(id, key)) || null;
          if (exam) {
            isLocalFallback = true;
            exercises = await loadExamExercisesEncrypted(id, key);
            mcGroups = await loadLocalMcGroups(id);
          } else {
            errorMsg = "Exam not found or has been deleted from server.";
            console.error("Exam not found on server or locally:", serverErr);
          }
        }
      } else {
        isLocalFallback = false;
        exam = (await loadExamEncrypted(id, key)) || null;
        exercises = await loadExamExercisesEncrypted(id, key);
        mcGroups = await loadLocalMcGroups(id);
      }
      if (browser && key) {
        try {
          libraryExercises = await loadExercisesEncrypted(key);
        } catch {}
      }
      submissions = await submissionRepository.getByExamId(id, key);
      await checkOmrTemplateStatus(id);
    } catch (err) {
      console.error("Failed to load exam from DB:", err);
    }
  }

  /**
   * Collects the MC-relevant exercises in exam order, mirroring buildExerciseInputs()'s
   * traversal. Resolves every id (standalone or group member) from a single merged
   * lookup built once per call -- `exercises` wins over `libraryExercises` on id
   * collision, since it's the authoritative per-exam copy. Previously this used two
   * independently-ordered `.find()` fallbacks per member, which could resolve to a
   * different set/instance depending on whether `libraryExercises` had finished
   * loading yet -- producing a different MC answer-key hash across calls (e.g.
   * handlePrepareOmr() vs. checkOmrTemplateStatus()) and a spurious "stale" banner
   * even right after a successful capture.
   */
  function collectMcExercises(): ExerciseRecord[] {
    return resolveMcExercises(exercises, libraryExercises, mcGroups);
  }

  /**
   * Hash of the exam's MC exercises' answer-key fields (shared with the scan-ingest
   * staleness check via mcExerciseHash.ts). Used to detect a stale OMR template after
   * an answer-key edit — never used to silently regenerate one.
   */
  async function computeExercisesHash(): Promise<string> {
    return computeMcExercisesHash(collectMcExercises());
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
      // 1. Post exam
      await api.post("/exams", {
        id: exam.id,
        title: exam.title || "Unbenannte Prüfung",
        testart: exam.testart,
        grade: exam.grade,
        klasse: exam.klasse,
        datum: exam.datum,
        nr: exam.nr,
        fach: exam.fach,
        lehrernachname: exam.lehrernachname,
        info_text: exam.infoText,
        latex_template: exam.latexTemplate,
        retention_until:
          exam.retentionUntil ||
          new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
        mc_groups: mcGroups.map((g, idx) => ({
          id: g.id,
          title: g.title,
          scoring_text: g.scoringText,
          order_index: exercises.length + idx + 1,
        })),
        exercise_links: [
          ...exercises.map((ex, idx) => ({
            exercise_id: ex.id,
            order_index: idx + 1,
          })),
          ...mcGroups.flatMap((g, gIdx) =>
            g.memberIds.map((exId, subIdx) => ({
              exercise_id: exId,
              order_index: exercises.length + gIdx + 1,
              mc_group_id: g.id,
              sub_index: subIdx + 1,
            }))
          ),
        ],
      });

      // 2. Post exercises
      for (const ex of exercises) {
        try {
          await api.post("/exercises", {
            id: ex.id,
            name: ex.title || ex.name || "Exercise",
            latex_body: ex.latexBody || "",
            max_points: ex.maxPoints,
            topic_tag: ex.topicTag,
            question_type: ex.questionType || "free_text",
            options: ex.options,
            correct_answers: ex.correctAnswers,
            penalty: ex.penalty || 0,
          });
        } catch {}
      }

      // Link exercises
      try {
        await api.patch(`/exams/${exam.id}`, {
          mc_groups: mcGroups.map((g, idx) => ({
            id: g.id,
            title: g.title,
            scoring_text: g.scoringText,
            order_index: exercises.length + idx + 1,
          })),
          exercise_links: [
            ...exercises.map((ex, idx) => ({
              exercise_id: ex.id,
              order_index: idx + 1,
            })),
            ...mcGroups.flatMap((g, gIdx) =>
              g.memberIds.map((exId, subIdx) => ({
                exercise_id: exId,
                order_index: exercises.length + gIdx + 1,
                mc_group_id: g.id,
                sub_index: subIdx + 1,
              }))
            ),
          ],
        });
      } catch {}

      // 3. Post students
      const localStudents = await db.students
        .where("examId")
        .equals(exam.id)
        .toArray();
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
          });
        } catch {}
      }

      // 4. Post submissions
      const localSubmissions = await db.submissions
        .where("examId")
        .equals(exam.id)
        .toArray();
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
          });
        } catch {}
      }

      isLocalFallback = false;
      alert("Exam successfully synced to server!");
    } catch (err: any) {
      alert(`Failed to sync exam to server: ${err.message}`);
    } finally {
      isSyncingSingle = false;
    }
  }

  async function handleDeleteExam() {
    if (!exam) return;
    if (
      !confirm(
        `Are you sure you want to delete exam "${exam.title}" and all its submissions?`,
      )
    )
      return;

    try {
      // Collect submission IDs first to clean up exercise scores
      const submissionIds = (await db.submissions.where("examId").equals(exam.id).toArray()).map((s) => s.id);

      // Delete exercise scores for all submissions in this exam to prevent orphaned data
      for (const subId of submissionIds) {
        await db.exerciseScores.where("submissionId").equals(subId).delete();
      }

      await db.exams.delete(exam.id);
      await db.exercises.where("examId").equals(exam.id).delete();
      await db.examExercises.where("examId").equals(exam.id).delete();
      await db.submissions.where("examId").equals(exam.id).delete();
      await db.students.where("examId").equals(exam.id).delete();

      if ($isAuthenticated && $storagePolicyStore.storageMode !== "all-local") {
        try {
          await api.delete(`/exams/${exam.id}`);
        } catch (e) {
          console.warn("Failed to delete on server:", e);
        }
      }

      window.location.href = "/";
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  }

  async function handleExportArchive() {
    const password = prompt("Enter password to encrypt .bgproj archive:");
    if (!password) return;

    isExporting = true;
    try {
      const blob = await packProject(password);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${exam?.title || "exam"}.bgproj`;
      a.click();
      URL.revokeObjectURL(url);
      exportSuccess = true;
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      isExporting = false;
    }
  }

  async function removeMcGroup(groupId: string) {
    mcGroups = mcGroups.filter((g) => g.id !== groupId);
    await saveExerciseLinks();
  }

  function buildExerciseInputs(): string {
    let exerciseCount = 0;
    return examItems
      .map((item) => {
        if (item.type === "exercise") {
          const ex = exercises.find((e) => e.id === item.id);
          if (!ex) return "";
          exerciseCount++;
          return formatExerciseLatex(
            ex.latexBody,
            ex.name || `Aufgabe ${exerciseCount}`,
            ex.id,
          );
        } else {
          const group = mcGroups.find((g) => g.id === item.id);
          if (!group) return "";
          const members = group.memberIds
            .map((id) => libraryExercises.find((e) => e.id === id) || exercises.find((e) => e.id === id))
            .filter((e): e is ExerciseRecord => Boolean(e));
          return formatMcGroupLatex(
            members.map((m) => ({ id: m.id, latexBody: m.latexBody || "" })),
            group.title,
            group.scoringText,
          );
        }
      })
      .filter(Boolean)
      .join("\n\n");
  }

  async function handlePrepareOmr() {
    if (!exam) return;
    isPreparingOmr = true;
    omrPrepareMessage = "Checking MC exercises...";
    errorMsg = "";

    try {
      const mcExercises = collectMcExercises();
      console.log("[PrepareOMR] MC exercises count:", mcExercises.length, mcExercises.map((e) => ({ id: e.id, name: e.name })));
      if (mcExercises.length === 0) {
        errorMsg = "OMR preparation failed: no MC exercises found in this exam.";
        isPreparingOmr = false;
        return;
      }

      const invalidExs = mcExercises.filter(
        (ex) => !ex.latexBody || (!ex.latexBody.includes("\\multi") && !ex.latexBody.includes("\\Lmulti"))
      );
      if (invalidExs.length > 0) {
        const names = invalidExs.map((ex) => `'${ex.name || ex.id}'`).join(", ");
        errorMsg = `OMR preparation failed: MC exercise(s) ${names} do not contain \\multi or \\Lmulti option bubbles in their LaTeX body. Please check and edit the exercise options.`;
        isPreparingOmr = false;
        return;
      }

      omrPrepareMessage = "Compiling blank exam...";
      const exerciseInputs = buildExerciseInputs();
      const opts = ["sans", "punkte"];

      const fullTex = `\\documentclass[a4paper]{article}
\\usepackage[${opts.join(",")}]{sty/Schulaufgabe}
\\Info{${exam.infoText || ""}}
\\Fach{${exam.fach || "Informatik"}}
\\Lehrernachname{${exam.lehrernachname || ""}}
\\usepackage{fontspec}
\\usetikzlibrary{shapes.geometric, arrows}
\\usepackage{sty/tikz-uml}
\\neverindent
\\WarningsOff
\\begin{document}
\\Testart{${exam.testart || "Kurzarbeit"}}
\\Klasse{${formatExamCourse(exam.grade, exam.klasse)}}
\\Datum{${exam.datum || ""}}
\\Nr{${exam.nr || "1"}}

${exerciseInputs}

\\end{document}`;

      const useLocal = $storagePolicyStore.latexCompilation === "local";
      const omrExCount = (fullTex.match(/\\OmrExercise/g) || []).length;
      const multiCount = (fullTex.match(/\\multi/g) || []).length;
      const lmultiCount = (fullTex.match(/\\Lmulti/g) || []).length;
      console.log(
        `[PrepareOMR] LaTeX macro counts in fullTex: \\OmrExercise=${omrExCount}, \\multi=${multiCount}, \\Lmulti=${lmultiCount}, fullTex length=${fullTex.length}`
      );
      if (!useLocal && !$isAuthenticated) {
        errorMsg = "Please log in to compile LaTeX on the server.";
        isPreparingOmr = false;
        return;
      }

      const result = await compileLatex(fullTex, useLocal, (status) => {
        if (status === "downloading") {
          omrPrepareMessage = "Loading local LaTeX compiler... (Downloading ~32MB on first load, please wait)";
        } else if (status === "compiling") {
          omrPrepareMessage = "Compiling blank exam...";
        }
      });

      console.log(
        `[PrepareOMR] LaTeX compile finished: pdfBytes=${result.pdfBytes?.length ?? 0}, engineUsed=${result.engineUsed ?? (useLocal ? "local" : "server")}, usedFallback=${result.usedFallback ?? false}`
      );

      omrPrepareMessage = "Extracting bubble positions...";

      const pdfjsLib = await loadPdfjs();
      const pdfDoc = await pdfjsLib.getDocument({ data: result.pdfBytes }).promise;
      console.log(`[PrepareOMR] pdfDoc loaded: numPages=${pdfDoc.numPages}`);

      const pages: OmrPageTemplate[] = [];
      for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
        const pdfPage = await pdfDoc.getPage(pageNum);
        const viewport = pdfPage.getViewport({ scale: 1 });
        const annotations = await pdfPage.getAnnotations();

        const bubbles: OmrBubbleRect[] = [];
        const fiducials: OmrFiducialRect[] = [];
        let linkAnnCount = 0;
        let matchedOmrCount = 0;
        const rejectedUris: string[] = [];

        const redoRects = new Map<string, [number, number, number, number]>();

        for (const ann of annotations) {
          if (ann.subtype !== "Link") continue;
          linkAnnCount++;
          const uri: string = ann.unsafeUrl ?? ann.url ?? "";
          const match = /^omr:\/\/([^/]+)\/(\d+)(\/redo)?$/.exec(uri);
          if (!match) {
            if (uri && rejectedUris.length < 5) rejectedUris.push(uri);
            continue;
          }
          matchedOmrCount++;
          const [, token, idxStr, isRedo] = match;
          const rect = ann.rect as [number, number, number, number];
          if (token === "__fid__") {
            const corner = Number(idxStr);
            if (corner === 0 || corner === 1 || corner === 2 || corner === 3) {
              fiducials.push({ corner, rect });
            }
          } else if (isRedo) {
            redoRects.set(`${token}|${idxStr}`, rect);
          } else {
            bubbles.push({ exerciseId: token, optionIndex: Number(idxStr), rect });
          }
        }

        for (const b of bubbles) {
          const redoRect = redoRects.get(`${b.exerciseId}|${b.optionIndex}`);
          if (redoRect) b.redoRect = redoRect;
        }

        console.log(
          `[PrepareOMR] Page ${pageNum}: totalAnnotations=${annotations.length}, linkAnnotations=${linkAnnCount}, matchedOmrLinks=${matchedOmrCount} (fiducials=${fiducials.length}, bubbles=${bubbles.length})` +
            (rejectedUris.length > 0 ? `, non-OMR Link URIs sample: ${JSON.stringify(rejectedUris)}` : "")
        );

        pages.push({
          pageIndex: pageNum - 1,
          pageWidthPt: viewport.width,
          pageHeightPt: viewport.height,
          fiducials,
          bubbles,
        });
      }

      console.log(
        "[PrepareOMR] Pages extraction summary:",
        pages.map((p) => ({ page: p.pageIndex + 1, fiducials: p.fiducials.length, bubbles: p.bubbles.length }))
      );

      const payload: OmrTemplatePayload = { pages };
      const exercisesHash = await computeExercisesHash();
      const key = get(sessionStore).sessionKey;
      await saveOmrTemplateEncrypted(exam.id, exercisesHash, payload, key);
      omrTemplateStatus = "ready";
      const totalBubbles = pages.reduce((sum, p) => sum + p.bubbles.length, 0);
      const mcExerciseCount = collectMcExercises().length;

      // A page with <4 fiducials or a template with zero bubbles despite having MC exercises
      // means the compile did not actually emit `omr://` link annotations (most likely the
      // LaTeX fiducial/bubble macros silently dropped content) — the template is useless for
      // alignment even though the compile itself "succeeded". Fail loudly here instead of
      // reporting success and letting every scan later fail alignment silently.
      const shortPages = pages.filter((p) => p.fiducials.length < 4).map((p) => p.pageIndex + 1);
      if (mcExerciseCount > 0 && totalBubbles === 0) {
        console.warn(
          `[PrepareOMR] FAILED: totalBubbles is 0 despite ${mcExerciseCount} MC exercise(s). Macro counts in fullTex were: \\OmrExercise=${omrExCount}, \\multi=${multiCount}, \\Lmulti=${lmultiCount}`
        );
        omrTemplateStatus = "stale";
        omrPrepareMessage = "";
        errorMsg =
          "OMR preparation failed: the compiled exam has no MC bubble markers at all. " +
          "The LaTeX MC/OMR macros likely failed to render — check that the exam actually contains MC exercises and that sty/Loesung.sty is up to date.";
      } else if (shortPages.length > 0) {
        omrTemplateStatus = "stale";
        omrPrepareMessage = "";
        errorMsg =
          `OMR preparation failed: page(s) ${shortPages.join(", ")} have fewer than 4 corner fiducial markers ` +
          `(needed for scan alignment). The LaTeX fiducial macros likely failed to render on those pages — ` +
          "re-check sty/Schulaufgabe.sty and re-run Prepare OMR.";
      } else {
        omrPrepareMessage = `OMR template saved (${pages.length} page(s), ${totalBubbles} bubble(s), 4 fiducials/page).`;
      }
    } catch (err: any) {
      errorMsg = err.message || "Failed to prepare OMR template.";
      omrPrepareMessage = "";
    } finally {
      isPreparingOmr = false;
    }
  }

  /**
   * Re-scores already-scanned submissions against the current OMR template — for exams
   * scanned before "Prepare OMR" was run, or after the answer key changed and the template
   * was refreshed. Skips any exercise the teacher has already hand-graded (`omrMeta.source
   * === "manual"`); overwrites OMR-derived scores in place (reuses their `id`).
   */
  async function handleRerunMcDetection() {
    if (!exam || omrTemplateStatus !== "ready" || submissions.length === 0) return;
    isRerunningMc = true;
    rerunMcMessage = "Loading OMR template...";
    errorMsg = "";

    try {
      const key = get(sessionStore).sessionKey;
      const templateResult = await loadOmrTemplateEncrypted(exam.id, key);
      if (!templateResult || !templateResult.payload) {
        rerunMcMessage = "";
        errorMsg = "No OMR template found — run Prepare OMR first.";
        return;
      }
      const templatePages = templateResult.payload.pages;

      const mcExercises = collectMcExercises();
      const answerKeys: OmrExerciseAnswerKey[] = mcExercises.map((e) => ({
        exerciseId: e.id,
        questionType: e.questionType as "mc" | "sc" | "tf",
        correctAnswers: e.correctAnswers ?? [],
        penalty: e.penalty ?? 0,
        maxPoints: e.maxPoints,
      }));

      const pdfjsLib = await loadPdfjs();

      const worker = new Worker(new URL("$lib/workers/omrWorker.ts", import.meta.url), {
        type: "module",
      });
      const runOmr = (req: OmrWorkerRequest): Promise<OmrWorkerResponse> =>
        new Promise((resolve, reject) => {
          const onMessage = (event: MessageEvent<OmrWorkerResponse>) => {
            worker.removeEventListener("message", onMessage);
            worker.removeEventListener("error", onError);
            resolve(event.data);
          };
          const onError = (err: ErrorEvent) => {
            worker.removeEventListener("message", onMessage);
            worker.removeEventListener("error", onError);
            reject(err.error || new Error(err.message));
          };
          worker.addEventListener("message", onMessage);
          worker.addEventListener("error", onError);
          worker.postMessage(req);
        });

      const scanScale = 2.0;
      let processed = 0;
      let updated = 0;
      let alignmentFailures = 0;

      try {
        for (const sub of submissions) {
          processed++;
          rerunMcMessage = `Processing submission ${processed}/${submissions.length}...`;
          if (!sub.scanCt || !sub.scanIv) continue;

          let pdfBytes: Uint8Array;
          try {
            pdfBytes = await decrypt(key, sub.scanCt, sub.scanIv);
          } catch (err) {
            console.warn(`Failed to decrypt scan for submission ${sub.id}:`, err);
            continue;
          }

          const existingScores = await loadScoresEncrypted(sub.id, key);
          const existingByExercise = new Map(existingScores.map((s) => [s.exerciseId, s]));

          const pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
          for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
            const pageTemplate = templatePages[pageNum - 1];
            if (!pageTemplate || (pageTemplate.bubbles.length === 0 && pageTemplate.fiducials.length === 0)) {
              continue;
            }

            const pdfPage = await pdfDoc.getPage(pageNum);
            const viewport = pdfPage.getViewport({ scale: scanScale });
            const canvas = document.createElement("canvas");
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d");
            if (!ctx) continue;
            await pdfPage.render({ canvas, canvasContext: ctx, viewport }).promise;
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

            const response = await runOmr({
              type: "OMR_PROCESS",
              imageData,
              pageTemplate,
              scanScale,
              answerKeys,
            });
            if (response.type !== "OMR_RESULT") continue;

            if (response.alignmentFailed) alignmentFailures++;

            for (const r of response.results) {
              const existing = existingByExercise.get(r.exerciseId);
              if (existing?.omrMeta?.source === "manual") continue;

              const failed = r.confidence === "failed";
              const nonBlankBubbles = r.bubbles.filter((b) => b.state !== "blank" && b.state !== "undone");
              await saveScoreEncrypted(
                {
                  id: existing?.id ?? crypto.randomUUID(),
                  submissionId: sub.id,
                  exerciseId: r.exerciseId,
                  // Leave unset on alignment failure so it hydrates as "ungraded" rather than
                  // silently contributing a 0 to the total (grade/+page.svelte).
                  score: failed ? undefined : r.score,
                  selectedOptions: failed ? [] : r.selectedOptions,
                  omrMeta: {
                    confidence: r.confidence,
                    source: "omr",
                    flaggedOptions: r.flaggedOptions.length > 0 ? r.flaggedOptions : undefined,
                    detections:
                      !failed && nonBlankBubbles.length > 0
                        ? {
                            pageIndex: r.pageIndex,
                            bubbles: nonBlankBubbles.map((b) => ({
                              optionIndex: b.optionIndex,
                              state: b.state,
                              rect: b.rect,
                            })),
                          }
                        : undefined,
                  },
                },
                key,
              );
              updated++;
            }
          }
        }
      } finally {
        worker.terminate();
      }

      rerunMcMessage =
        `MC detection re-run complete: ${updated} score(s) updated across ${processed} submission(s).` +
        (alignmentFailures > 0
          ? ` ${alignmentFailures} page(s) failed alignment — those exercises need manual grading.`
          : "");
    } catch (err: any) {
      errorMsg = err.message || "Failed to re-run MC detection.";
      rerunMcMessage = "";
    } finally {
      isRerunningMc = false;
    }
  }

  async function handlePreviewExam() {
    if (!exam || (exercises.length === 0 && mcGroups.length === 0)) return;
    const currentExam = exam;
    isPreviewLoading = true;
    compileNotice = "";
    errorMsg = "";

    try {
      const exerciseInputs = buildExerciseInputs();

      const getPreamble = (options: string) => `\\documentclass[a4paper]{article}
\\usepackage[${options}]{sty/Schulaufgabe}
\\Info{${currentExam.infoText || ""}}
\\Fach{${currentExam.fach || "Informatik"}}
\\Lehrernachname{${currentExam.lehrernachname || ""}}
\\usepackage{fontspec}
\\usetikzlibrary{shapes.geometric, arrows}
\\usepackage{sty/tikz-uml}
\\neverindent
\\WarningsOff
\\begin{document}
\\Testart{${currentExam.testart || "Kurzarbeit"}}
\\Klasse{${formatExamCourse(currentExam.grade, currentExam.klasse)}}
\\Datum{${currentExam.datum || ""}}
\\Nr{${currentExam.nr || "1"}}

${exerciseInputs}

\\end{document}`;

      const fullTexAngabe = getPreamble("sans,punkte");
      const fullTexLoesung = getPreamble("sans,punkte,antworten");

      const useLocal = $storagePolicyStore.latexCompilation === "local";

      const resAngabe = await compileLatex(fullTexAngabe, useLocal, (status) => {
        if (status === 'downloading') {
          compileNotice = "Loading local LaTeX compiler... (Downloading ~32MB on first load, please wait)";
        } else if (status === 'compiling') {
          compileNotice = "Compiling PDF...";
        }
      }, false);

      const blobAngabe = new Blob([resAngabe.pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      if (previewPdfUrl) URL.revokeObjectURL(previewPdfUrl);
      previewPdfUrl = URL.createObjectURL(blobAngabe);

      const resLoesung = await compileLatex(fullTexLoesung, useLocal, undefined, false);
      const blobLoesung = new Blob([resLoesung.pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      if (previewSolutionPdfUrl) URL.revokeObjectURL(previewSolutionPdfUrl);
      previewSolutionPdfUrl = URL.createObjectURL(blobLoesung);

      compileNotice = "";
    } catch (err: any) {
      errorMsg = `Preview failed: ${err.message || "Unknown compilation error"}`;
    } finally {
      isPreviewLoading = false;
    }
  }

  let isEditingMetadata = false;
  let editTitle = "";
  let editTestart = "";
  let editGrade = "";
  let editKlasse = "";
  let editDatum = "";
  let editNr = "";
  let editFach = "";
  let editLehrernachname = "";
  let editInfoText = "";
  let editRetentionUntil = "";
  let editGradingKey: GradingKeyConfig = {
    preset: "linear_50",
    cutoffs: getPresetCutoffs("linear_50"),
  };

  let initialMetadata = {
    title: "",
    testart: "",
    grade: "",
    klasse: "",
    datum: "",
    nr: "",
    fach: "",
    lehrernachname: "",
    infoText: "",
    retentionUntil: "",
  };
  let showMetadataConfirm = false;

  $: isMetadataDirty =
    isEditingMetadata &&
    (editTitle !== initialMetadata.title ||
      editTestart !== initialMetadata.testart ||
      editGrade !== initialMetadata.grade ||
      editKlasse !== initialMetadata.klasse ||
      editDatum !== initialMetadata.datum ||
      editNr !== initialMetadata.nr ||
      editFach !== initialMetadata.fach ||
      editLehrernachname !== initialMetadata.lehrernachname ||
      editInfoText !== initialMetadata.infoText ||
      editRetentionUntil !== initialMetadata.retentionUntil);

  $: totalPoints = exercises.reduce((sum, ex) => sum + (ex.maxPoints ?? 0), 0);
  $: submissionsCount = submissions.length;
  $: studentsCount = new Set(submissions.map((s) => s.pseudonymHash)).size;
  $: gradedCount = submissions.filter(
    (s) => typeof s.totalScore === "number" && !isNaN(s.totalScore),
  ).length;
  $: storagePolicyModeString = $storagePolicyStore.storageMode;

  let isLibraryModalOpen = false;
  let libraryExercises: ExerciseRecord[] = [];
  let selectedLibraryIds: string[] = [];
  let initialSelectedLibraryIds: string[] = [];
  let showLibraryConfirm = false;
  let librarySearch = "";
  let activeVariantPerGroup: Record<string, string> = {};

  interface VariantMember {
    ex: ExerciseRecord;
    variantLabel: string;
    version: number;
    isCurrent: boolean;
  }

  interface ExerciseGroup {
    groupId: string;
    name: string;
    topicTag: string;
    grade?: string;
    subject?: string;
    maxPoints: number;
    minPoints: number;
    variants: Map<string, VariantMember[]>;
    allMembers: VariantMember[];
  }

  $: isLibraryDirty =
    isLibraryModalOpen &&
    (selectedLibraryIds.length !== initialSelectedLibraryIds.length ||
      selectedLibraryIds.some((id, i) => id !== initialSelectedLibraryIds[i]));

  $: filteredLibrary = libraryExercises.filter((ex) => {
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
  });

  $: filteredGroups = groupExercises(filteredLibrary);

  function groupExercises(exs: ExerciseRecord[]): ExerciseGroup[] {
    const buckets = new Map<string, ExerciseRecord[]>();

    for (const ex of exs) {
      const key = ex.exerciseGroupId || `name:${ex.name || "Untitled"}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(ex);
    }

    const groups: ExerciseGroup[] = [];

    for (const [groupId, members] of buckets) {
      const currentMembers = members.filter((m) => m.isCurrent !== false);
      if (currentMembers.length === 0) continue;

      const name = currentMembers[0]?.name || "Untitled";
      const topicTag = currentMembers[0]?.topicTag || "_General";
      const grade = currentMembers[0]?.grade;
      const subject = currentMembers[0]?.subject;

      const variants = new Map<string, VariantMember[]>();
      for (const ex of currentMembers) {
        const vKey = ex.variantKey || "_General";
        if (!variants.has(vKey)) variants.set(vKey, []);
        variants.get(vKey)!.push({
          ex,
          variantLabel: vKey,
          version: ex.version || 1,
          isCurrent: ex.isCurrent !== false,
        });
      }

      const sortedVariants = new Map<string, VariantMember[]>();
      const keys = [...variants.keys()].sort((a, b) => {
        if (a === "_General") return -1;
        if (b === "_General") return 1;
        return a.localeCompare(b);
      });
      for (const k of keys) sortedVariants.set(k, variants.get(k)!);

      for (const [, vMembers] of sortedVariants) {
        vMembers.sort((a, b) => b.version - a.version);
      }

      const allMembers: VariantMember[] = [];
      for (const [, vMembers] of sortedVariants) {
        allMembers.push(...vMembers);
      }

      const scores = allMembers.map((m) => parseExerciseScore(m.ex.latexBody || "") || m.ex.maxPoints || 0);
      const maxPoints = scores.length > 0 ? Math.max(...scores) : 0;
      const minPoints = scores.length > 0 ? Math.min(...scores) : 0;

      groups.push({
        groupId,
        name,
        topicTag,
        grade,
        subject,
        maxPoints,
        minPoints,
        variants: sortedVariants,
        allMembers,
      });
    }

    groups.sort((a, b) => a.name.localeCompare(b.name));
    return groups;
  }

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
      lehrernachname: editLehrernachname,
      infoText: editInfoText,
      retentionUntil: editRetentionUntil,
    };
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
    try {
      if ($isAuthenticated && $storagePolicyStore.storageMode !== "all-local") {
        await api.patch(`/exams/${exam.id}`, {
          title: editTitle,
          testart: editTestart,
          grade: editGrade,
          klasse: editKlasse,
          datum: editDatum,
          nr: editNr,
          fach: editFach,
          lehrernachname: editLehrernachname,
          info_text: editInfoText,
          grading_key: editGradingKey,
          retention_until: editRetentionUntil,
        });
      }

      exam.title = editTitle;
      exam.testart = editTestart;
      exam.grade = editGrade;
      exam.klasse = editKlasse;
      exam.datum = editDatum;
      exam.nr = editNr;
      exam.fach = editFach;
      exam.lehrernachname = editLehrernachname;
      exam.infoText = editInfoText;
      exam.retentionUntil = editRetentionUntil;
      exam.gradingKey = editGradingKey;
      const key = get(sessionStore).sessionKey;
      await saveExamEncrypted(exam, key);

      forceCancelMetadata();
      alert("Exam details updated successfully.");
    } catch (err: any) {
      alert(`Failed to save exam details: ${err.message}`);
    }
  }

  async function openLibraryModal() {
    if (!editingMcGroupId) {
      mcStagingIds = [];
    }
    const key = get(sessionStore).sessionKey;
    try {
      if ($isAuthenticated && $storagePolicyStore.storageMode !== "all-local") {
        const remoteExs = (await api.get("/exercises")) as any[];
        libraryExercises = remoteExs.map((e: any) => ({
          id: e.id,
          teacherId: e.teacher_id,
          name: e.name,
          topicTag: e.topic_tag,
          grade: e.grade || undefined,
          subject: e.subject || undefined,
          latexBody: e.latex_body,
          maxPoints: e.max_points,
          version: e.version || 1,
          variantKey: e.variant_key,
          isCurrent: e.is_current,
          exerciseGroupId: e.exercise_group_id || undefined,
          isPublic: e.is_public,
          questionType: e.question_type || "free_text",
          penalty: e.penalty || 0,
        }));
      } else {
        libraryExercises = await loadExercisesEncrypted(key);
      }
      selectedLibraryIds = exercises.map((e) => e.id);
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

  let mcStagingIds: string[] = [];
  let editingMcGroupId: string | null = null;
  let selectedGradeFilter = "ALL";
  let selectedSubjectFilter = "ALL";
  let selectedTopicFilter = "ALL";

  $: availableGrades = [...new Set(libraryExercises.map((e) => e.grade).filter((g): g is string => Boolean(g)))].sort();
  $: availableSubjects = [...new Set(libraryExercises.map((e) => e.subject).filter((s): s is string => Boolean(s)))].sort();
  $: availableTopics = [...new Set(libraryExercises.map((e) => e.topicTag).filter((t): t is string => Boolean(t)))].sort();
  $: totalVariantsCount = libraryExercises.length;

  function toggleMcStaging(id: string) {
    if (mcStagingIds.includes(id)) {
      mcStagingIds = mcStagingIds.filter((i) => i !== id);
    } else {
      if (mcStagingIds.length >= 4) return;
      mcStagingIds = [...mcStagingIds, id];
    }
  }

  function reorderMcStaging(index: number, direction: "up" | "down") {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= mcStagingIds.length) return;
    const copy = [...mcStagingIds];
    [copy[index], copy[targetIdx]] = [copy[targetIdx], copy[index]];
    mcStagingIds = copy;
  }

  function finalizeMcGroup(title: string, scoringText: string) {
    if (mcStagingIds.length < 1 || mcStagingIds.length > 4) return;
    if (editingMcGroupId) {
      mcGroups = mcGroups.map((g) =>
        g.id === editingMcGroupId
          ? { ...g, title, scoringText, memberIds: [...mcStagingIds] }
          : g
      );
      editingMcGroupId = null;
    } else {
      mcGroups = [
        ...mcGroups,
        {
          id: crypto.randomUUID(),
          title,
          scoringText,
          memberIds: [...mcStagingIds],
        },
      ];
    }
    mcStagingIds = [];
    saveExerciseLinks();
  }

  function editMcGroup(groupId: string) {
    const group = mcGroups.find((g) => g.id === groupId);
    if (!group) return;
    editingMcGroupId = group.id;
    mcStagingIds = [...group.memberIds];
    openLibraryModal();
  }

  function moveExamItem(index: number, direction: "up" | "down") {
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= examItems.length) return;
    const copy = [...examItems];
    [copy[index], copy[targetIdx]] = [copy[targetIdx], copy[index]];
    examItems = copy;
    saveExerciseLinks();
  }

  function moveExerciseOrder(index: number, direction: "up" | "down") {
    moveExamItem(index, direction);
  }

  function removeExerciseLink(id: string) {
    exercises = exercises.filter((ex) => ex.id !== id);
    examItems = examItems.filter((item) => !(item.type === "exercise" && item.id === id));
    saveExerciseLinks();
  }

  function getEffectiveExamItems(): ExamItemRef[] {
    const validIds = new Set([
      ...exercises.map((e) => e.id),
      ...mcGroups.map((g) => g.id),
    ]);
    const currentItems = examItems.filter((item) => validIds.has(item.id));
    const currentItemIds = new Set(currentItems.map((item) => item.id));

    const missingExercises = exercises
      .filter((e) => !mcGroups.some((g) => g.memberIds.includes(e.id)) && !currentItemIds.has(e.id))
      .map((e) => ({ type: "exercise" as const, id: e.id }));

    const missingGroups = mcGroups
      .filter((g) => !currentItemIds.has(g.id))
      .map((g) => ({ type: "mc_group" as const, id: g.id }));

    return [...currentItems, ...missingExercises, ...missingGroups];
  }

  async function saveExerciseLinks() {
    if (!exam) return;
    const currentExamId = exam.id;
    const itemsToSave = getEffectiveExamItems();
    examItems = itemsToSave;

    let order = 1;
    const exerciseLinksPayload: any[] = [];
    const mcGroupsPayload: any[] = [];
    const examExerciseRecords: any[] = [];
    const mcGroupRecords: any[] = [];

    for (const item of itemsToSave) {
      if (item.type === "exercise") {
        exerciseLinksPayload.push({
          exercise_id: item.id,
          order_index: order,
        });
        examExerciseRecords.push({
          examId: currentExamId,
          exerciseId: item.id,
          orderIndex: order,
        });
        order++;
      } else if (item.type === "mc_group") {
        const group = mcGroups.find((g) => g.id === item.id);
        if (group) {
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
          group.memberIds.forEach((exId, subIdx) => {
            exerciseLinksPayload.push({
              exercise_id: exId,
              order_index: order,
              mc_group_id: group.id,
              sub_index: subIdx + 1,
            });
            examExerciseRecords.push({
              examId: currentExamId,
              exerciseId: exId,
              orderIndex: order,
              mcGroupId: group.id,
              subIndex: subIdx + 1,
            });
          });
          order++;
        }
      }
    }

    try {
      await db.examMcGroups.where("examId").equals(currentExamId).delete();
      if (mcGroupRecords.length > 0) {
        await db.examMcGroups.bulkPut(mcGroupRecords);
      }

      await db.examExercises.where("examId").equals(currentExamId).delete();
      await db.examExercises.bulkPut(examExerciseRecords);
    } catch (err) {
      console.error("Failed to update local exercise links:", err);
      errorMsg = "Failed to save exercise links locally. Please retry.";
      return;
    }

    if ($storagePolicyStore.storageMode !== "all-local") {
      try {
        await api.patch(`/exams/${currentExamId}`, {
          mc_groups: mcGroupsPayload,
          exercise_links: exerciseLinksPayload,
        });
      } catch (err) {
        console.error("Failed to sync exercise links to server:", err);
      }
    }
  }

  function toggleLibrarySelection(id: string) {
    if (selectedLibraryIds.includes(id)) {
      selectedLibraryIds = selectedLibraryIds.filter((i) => i !== id);
    } else {
      selectedLibraryIds = [...selectedLibraryIds, id];
    }
  }

  function applyLibrarySelection() {
    const newSelected = selectedLibraryIds
      .map((id) => libraryExercises.find((ex) => ex.id === id))
      .filter((ex): ex is ExerciseRecord => Boolean(ex))
      .map((ex, idx) => ({ ...ex, orderIndex: idx + 1 }));

    exercises = newSelected;
    saveExerciseLinks();
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
      alert("No submissions to delete.");
      return;
    }
    if (
      !confirm(
        `Are you sure you want to delete all ${submissions.length} submission(s) for this exam? This cannot be undone.`,
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
      alert("All submissions deleted.");
    } catch (err: any) {
      alert(`Failed to delete submissions: ${err.message}`);
    } finally {
      isDeletingAllSubmissions = false;
    }
  }
</script>

<div class="exam-detail-page">
  {#if isLocalFallback}
    <div class="local-fallback-banner">
      <span>ℹ️ This exam is currently loaded from local browser storage.</span>
      <button
        class="sync-now-btn"
        on:click={syncCurrentExamToServer}
        disabled={isSyncingSingle}
      >
        {isSyncingSingle ? "Syncing..." : "Sync to Server Now"}
      </button>
    </div>
  {/if}

  {#if !exam}
    <div class="loading">Loading exam details...</div>
  {:else}
    <ExamMetadata
      {exam}
      {totalPoints}
      {submissionsCount}
      {studentsCount}
      {gradedCount}
      storagePolicy={storagePolicyModeString}
    />

    <ExamActionBar
      {examId}
      onEdit={openMetadataEditor}
      onDelete={handleDeleteExam}
      onExport={handleExportArchive}
      onScan={handleScan}
      onGrade={handleGrade}
      onStats={handleStats}
      onAddExercises={openLibraryModal}
      onDeleteAllSubmissions={handleDeleteAllSubmissions}
      storagePolicy={storagePolicyModeString}
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
      bind:editLehrernachname
      bind:editInfoText
      bind:editRetentionUntil
      bind:editGradingKey
      onSave={handleSaveMetadata}
      onCancel={requestCancelMetadata}
    />

<ConfirmDialog
  isOpen={showMetadataConfirm}
  title="Discard Metadata Changes?"
  message="You have unsaved changes in metadata fields. Are you sure you want to discard them?"
  confirmText="Discard Changes"
  cancelText="Keep Editing"
  on:confirm={forceCancelMetadata}
  on:cancel={() => (showMetadataConfirm = false)}
/>

    {#if exportSuccess}
      <div class="exam-success-banner">
        .bgproj archive successfully packed and downloaded.
      </div>
    {/if}

    <div class="exam-two-col">
      <div class="pdf-compile-section">
      <h3>LaTeX Exam Compilation & Download</h3>
      <p class="desc">
        Generate printable A4 PDF exams using the Schulaufgabe template layout.
      </p>

      <div class="exam-controls-row">
        <button
          class="compile-btn"
          class:is-loading={isPreviewLoading}
          on:click={handlePreviewExam}
          disabled={isPreviewLoading || exercises.length === 0}
        >
          {isPreviewLoading ? "Compiling Previews..." : "🔍 Live Preview PDF"}
        </button>

        <button
          class="compile-btn"
          class:is-loading={isPreparingOmr}
          on:click={handlePrepareOmr}
          disabled={isPreparingOmr || exercises.length === 0}
          title="Compiles a blank exam locally and captures MC bubble positions for automatic grading during scan."
        >
          {isPreparingOmr
            ? "Preparing OMR..."
            : omrTemplateStatus === "stale"
              ? "🎯 Re-run Prepare OMR"
              : "🎯 Prepare OMR"}
        </button>

        <button
          class="compile-btn"
          class:is-loading={isRerunningMc}
          on:click={handleRerunMcDetection}
          disabled={isRerunningMc || omrTemplateStatus !== "ready" || submissions.length === 0}
          title="Re-scores already-scanned submissions against the current OMR template. Skips exercises already hand-graded."
        >
          {isRerunningMc ? "Re-running MC detection..." : "🔁 Re-run MC detection"}
        </button>
      </div>

      {#if omrTemplateStatus === "stale"}
        <div class="exam-notice exam-notice--warning">
          MC answer key changed since the OMR template was captured — auto-grading may be
          inaccurate until you re-run "Prepare OMR".
        </div>
      {/if}
      {#if omrPrepareMessage}
        <div class="exam-notice">{omrPrepareMessage}</div>
      {/if}
      {#if rerunMcMessage}
        <div class="exam-notice">{rerunMcMessage}</div>
      {/if}

      {#if previewPdfUrl || previewSolutionPdfUrl}
        <div style="margin-top: 1rem;">
          <DualPdfPreview
            {previewPdfUrl}
            {previewSolutionPdfUrl}
            bind:showAngabePreview
            bind:showLoesungPreview
            titleAngabe="Exam"
            titleLoesung="Answer Key"
            height="550px"
            placeholderText="Click 'Live Preview PDF' to render"
          />
        </div>
      {/if}

      {#if compileNotice}
        <div class="exam-notice">{compileNotice}</div>
      {/if}
      {#if errorMsg}
        <div class="exam-error-banner">{errorMsg}</div>
      {/if}
    </div>

 

    <ExerciseList
      {exercises}
      {mcGroups}
      {libraryExercises}
      {examItems}
      onRemove={removeExerciseLink}
      onMoveUp={(idx) => moveExerciseOrder(idx, "up")}
      onMoveDown={(idx) => moveExerciseOrder(idx, "down")}
      onMoveExamItem={moveExamItem}
      onRemoveMcGroup={removeMcGroup}
      onEditMcGroup={editMcGroup}
    />
    </div>
  {/if}
</div>

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
  {editingMcGroupId}
  onToggleMcStaging={toggleMcStaging}
  onReorderMcStaging={reorderMcStaging}
  onFinalizeMcGroup={finalizeMcGroup}
  onToggleSelection={toggleLibrarySelection}
  onSetGroupVariant={setGroupVariant}
  onApply={applyLibrarySelection}
  onRequestClose={requestCloseLibraryModal}
/>

<ConfirmDialog
  isOpen={showLibraryConfirm}
  title="Discard Exercise Selections?"
  message="You have unsaved changes in your selected exercises. Are you sure you want to exit without applying?"
  confirmText="Discard Changes"
  cancelText="Keep Editing"
  on:confirm={forceCloseLibraryModal}
  on:cancel={() => (showLibraryConfirm = false)}
/>

