<script lang="ts">
  import ExamPageHeader from "#lib/components/exam/ExamPageHeader.svelte";
  import { newTrashGroup } from "#lib/trash/group";
  import { TRASH_DAYS } from "#lib/trash/localTrash";
  import { randomCode } from "#lib/utils/randomCode";
  import { page } from "$app/state";
  import { browser } from "$app/env";
  import {
    detectHardware,
    PipelineMonitor,
    type HardwareProfile,
  } from "#lib/hardware/detect";
  import { joinKey } from "#lib/crypto/pseudonymKey";
  import { pseudonymFor } from "#lib/services/pseudonymRekey";
  import { sessionStore, awaitSessionReady } from "#lib/stores/session";
  import { storagePolicyStore } from "#lib/stores/storagePolicy";
  import {
    loadStudentsEncrypted,
    saveStudentEncrypted,
    saveSubmissionEncrypted,
    openScan,
    sealScan,
  } from "#lib/db/dbEncryption";
  import { loadExamMcExercises } from "#lib/grading/mcExerciseHash";
  import { loadExamCompileContext } from "#lib/grading/omrTemplatePrep";
  import { loadOmrTemplateCandidates } from "#lib/grading/omrTemplatePins";
  import type { OmrTemplateCandidate } from "#lib/grading/omrTemplateChoice";
  import { isMcQuestion } from "#lib/grading/mcScore";
  import { omrSettingsStore } from "#lib/stores/omrSettings";
  import { api } from "#lib/api/client";
  import { submissionRepository } from "#lib/repositories/submissionRepository";
  import { studentRepository } from "#lib/repositories/studentRepository";
  import type { GradingReviewItem, StudentRecord, PseudonymVersion } from "#lib/db/schema";
  import { scoreRepository } from "#lib/repositories/scoreRepository";
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { WorkerPool } from "#lib/workers/pool";
  import { spawnOmrWorker, spawnQrWorker } from "#lib/workers/spawn";
  import type {
    QrWorkerRequest,
    QrWorkerResponse,
  } from "#lib/workers/qrWorker";
  import type {
    OmrWorkerRequest,
    OmrWorkerResponse,
    OmrExerciseAnswerKey,
  } from "#lib/workers/omrWorker";
  import { parseStudentQr } from "#lib/utils/studentQr";
  import { ingestScans, type IngestProgress, type IngestWarning, type OmrSummary } from "#lib/scan/ingest";
  import { carryAttachments } from "#lib/scan/scanPdf";
  import { examNavContext } from "#lib/stores/shell";
  import HardwareProfileCard from "#lib/components/scanning/HardwareProfileCard.svelte";
  import UploadPanel from "#lib/components/scanning/UploadPanel.svelte";
  import { Alert, Button, PageShell } from "#lib/components/ui";
  import UnmatchedResolver from "#lib/components/scanning/UnmatchedResolver.svelte";
  import ScannedSubmissionsTable from "#lib/components/scanning/ScannedSubmissionsTable.svelte";
  import ScanPreviewModal from "#lib/components/scanning/ScanPreviewModal.svelte";
  import GradedPdfDialog from "#lib/components/scanning/GradedPdfDialog.svelte";
  import { printableReviewOf } from "#lib/sharing/reviewService";
  import type { ReviewPrintOptions } from "#lib/export/reviewPrint";
  import { t, translate } from "#lib/i18n";
  import { renderGradedPdf } from "#lib/export/gradedPdf";
  import { downloadBlob } from "#lib/components/stats/chartExport";

  interface Props {
    params?: Record<string, string>;
  }

  let { params }: Props = $props();

  const examId = page.params.id || "";

  // Raw: hwProfile/monitor feed PipelineMonitor and the worker pools.
  let hwProfile: HardwareProfile = $state.raw({
    logicalCores: 4,
    estimatedRAMGB: 8,
    simdSupported: true,
    fileSystemAccessAPI: true,
    recommendedMode: "parallel",
  });
  let monitor: PipelineMonitor | undefined = $state.raw();
  let isProcessing = $state(false);
  let progress = $state(0);
  let statusText = $state(translate("scanning.status.ready"));

  interface UnmatchedSubmission {
    submissionId: string;
    studentId: string;
    currentFallback: string;
    newCode: string;
  }

  interface ScannedSubmissionItem {
    id: string;
    pseudonymHmac: string;
    pseudonymVersion?: PseudonymVersion;
    fallbackCode: string;
    studentName?: string;
    studentNumber?: string;
    createdAt: string;
    scanCt?: Uint8Array;
    scanIv?: Uint8Array;
    totalScore?: number;
    annotationCt?: Uint8Array;
    annotationIv?: Uint8Array;
    /** The student came from the Students page: deleting the scan keeps them. */
    fromList?: boolean;
  }

  // Raw: records go back to repositories; UnmatchedResolver binds item.newCode on the shared objects.
  let unmatchedList: UnmatchedSubmission[] = $state.raw([]);
  let scannedSubmissions: ScannedSubmissionItem[] = $state.raw([]);
  // Starts true: the overview must not flash "no submissions yet" while the first fetch is still in flight (see loadScannedSubmissions()).
  let isLoadingSubmissions = $state(true);
  // A failed list read hides the table (an empty one would say "no submissions yet"); `readError` covers the other reads.
  let submissionsLoadError = $state("");
  let readError = $state("");
  let previewModalOpen = $state(false);
  let previewItem: ScannedSubmissionItem | null = $state.raw(null);
  let previewObjectUrl: string | null = $state(null);
  let previewIsPdf = $state(false);
  let previewLoading = $state(false);
  let previewError = $state("");
  /** Bumped on every open/close: a slower earlier decrypt must not show (or leak) its scan. */
  let previewSeq = 0;
  let qrPool: WorkerPool<QrWorkerRequest, QrWorkerResponse> | null = null;
  let omrPool: WorkerPool<OmrWorkerRequest, OmrWorkerResponse> | null = null;

  /** Templates a page may have been printed with: pins newest first, then the current layout (issue #239). */
  let omrTemplates: OmrTemplateCandidate[] = [];
  let omrAnswerKeys: OmrExerciseAnswerKey[] = [];
  let omrAvailable = false;
  let omrBanner = $state("");
  // Pages the last upload could not place (issue #220): missing, extra or of another exam. Every page was kept.
  let pageNotes = $state.raw<string[]>([]);
  /** Loose or twice-scanned pages kept after the exam's pages: expected with extra paper (issue #228), so a note, not a warning. */
  let paperNotes = $state.raw<string[]>([]);
  /** Null until `loadOmrContext` knows; without MC the template only serves the score boxes in grading. */
  let examHasMc: boolean | null = null;

  /** Loads the exam's OMR template + MC answer key, gating auto-grading on a fresh (non-stale) template. Exams without MC skip it here: a visit never compiles, the template follows an upload (`prepareScoreBoxTemplate`). */
  async function loadOmrContext() {
    await awaitSessionReady();
    const key = get(sessionStore).sessionKey;
    const mcExercises = await loadExamMcExercises(examId, key).catch(() => []);
    examHasMc = mcExercises.length > 0;
    if (!examHasMc) {
      omrAvailable = false;
      omrBanner = "";
      return;
    }
    await prepareOmrContext(key, mcExercises, false);
  }

  /** After an upload to an exam without MC: refreshes the template in the background so grading can fill the printed score boxes (issue #187). */
  function prepareScoreBoxTemplate() {
    if (examHasMc !== false) return;
    void prepareOmrContext(get(sessionStore).sessionKey, [], true).finally(() => (omrAvailable = false));
  }

  /** `quiet` (exam without MC): the template only serves the score boxes in grading, so its preparation never shows a banner here. */
  async function prepareOmrContext(key: CryptoKey | null, mcExercises: Awaited<ReturnType<typeof loadExamMcExercises>>, quiet: boolean) {
    const banner = (message: string) => {
      if (!quiet) omrBanner = message;
    };
    try {
      const compileCtx = await loadExamCompileContext(examId, key);
      let captured = false;
      // Pins first (issue #239): sheets printed before a later edit are read with the layout they were printed with.
      const res = await loadOmrTemplateCandidates(examId, key, compileCtx, (msg) => {
        captured = true;
        banner(`${translate("scanning.omrBanner.autoPreparing")} - ${msg}`);
      });
      if (res.candidates.length === 0) {
        omrAvailable = false;
        banner(translate("scanning.omrBanner.autoPrepareFailed", { message: res.currentError ?? res.pinsError ?? translate("scanning.examContextNotFound") }));
        return;
      }
      omrTemplates = res.candidates;
      omrAnswerKeys = mcExercises.map((e) => ({
        exerciseId: e.id,
        questionType: e.questionType as "mc" | "sc" | "tf",
        correctAnswers: e.correctAnswers ?? [],
        penalty: e.penalty ?? 0,
        maxPoints: e.maxPoints,
      }));
      omrAvailable = true;
      if (res.pinsError) banner(translate("scanning.omrBanner.pinsFailed", { message: res.pinsError }));
      else banner(captured ? translate("scanning.omrBanner.autoPrepared") : "");
    } catch (err) {
      console.error("Failed to load OMR context:", err);
      omrAvailable = false;
      banner("");
    }
  }

  onMount(() => {
    if (browser) {
      hwProfile = detectHardware();
      monitor = new PipelineMonitor(hwProfile);
      monitor.on("downgrade", () => {
        statusText = translate("scanning.status.memoryDowngraded");
      });
      qrPool = new WorkerPool(spawnQrWorker, monitor);
      omrPool = new WorkerPool(spawnOmrWorker, monitor);
      refreshUnmatched();
      loadScannedSubmissions();
      loadOmrContext();
    }

    return () => {
      qrPool?.terminate();
      omrPool?.terminate();
      if (previewObjectUrl) {
        URL.revokeObjectURL(previewObjectUrl);
      }
    };
  });

  async function loadScannedSubmissions() {
    isLoadingSubmissions = true;
    try {
      await awaitSessionReady();
      const key = get(sessionStore).sessionKey;
      const submissions = await submissionRepository.getByExamId(examId, key);
      const students = await studentRepository.getByExamId(examId, key);

      // Rows meet on the join key, whatever pseudonym version each is stored at (issue #177).
      const studentMap = new Map<string, StudentRecord>();
      for (const st of students) {
        if (st.pseudonymHmac) studentMap.set(await joinKey(st), st);
        if (st.fallbackCode) studentMap.set(st.fallbackCode, st);
      }

      // Only a version-1 value may still be the raw QR text; a keyed one never is.
      const rawOf = (row: { pseudonymHmac: string; pseudonymVersion?: PseudonymVersion }) =>
        row.pseudonymVersion === 2 ? undefined : row.pseudonymHmac;

      const items: ScannedSubmissionItem[] = [];
      for (const sub of submissions) {
        const st = sub.pseudonymHmac ? studentMap.get(await joinKey(sub)) : undefined;

        let sName = st?.studentName;
        let sNumber = st?.studentNumber;
        let fCode = st?.fallbackCode;

        const qrCandidate =
          [st?.pseudonymRaw, st && rawOf(st), rawOf(sub), fCode].find((v) => v?.includes('_')) ?? null;

        if (qrCandidate) {
          const parsed = parseStudentQr(qrCandidate);
          if (parsed) {
            sName = sName || parsed.displayName;
            sNumber = sNumber || parsed.studentNumber;
            if (!fCode || fCode === "UNKNOWN" || fCode.length === 64) {
              fCode = parsed.displayName;
            }
          }
        }

        if (!fCode || fCode === "UNKNOWN") {
          fCode = sName || (sub.pseudonymHmac.length > 16 ? sub.pseudonymHmac.substring(0, 8) : sub.pseudonymHmac);
        }

        items.push({
          id: sub.id,
          pseudonymHmac: sub.pseudonymHmac,
          pseudonymVersion: sub.pseudonymVersion,
          fallbackCode: fCode,
          studentName: sName,
          studentNumber: sNumber,
          createdAt: sub.createdAt || new Date().toISOString(),
          scanCt: sub.scanCt,
          scanIv: sub.scanIv,
          totalScore: sub.totalScore,
          annotationCt: sub.annotationCt,
          annotationIv: sub.annotationIv,
          fromList: st?.fromList,
        });
      }

      scannedSubmissions = items;
      submissionsLoadError = "";
    } catch (err) {
      console.error("Failed to load scanned submissions:", err);
      submissionsLoadError = translate("scanning.errorLoadSubmissions", { message: errorText(err) });
    } finally {
      isLoadingSubmissions = false;
    }
  }

  const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

  async function openPreview(item: ScannedSubmissionItem) {
    closePreview();
    const seq = previewSeq;
    previewItem = item;
    previewModalOpen = true;
    previewLoading = true;
    previewError = "";

    const session = get(sessionStore);
    const key = session.sessionKey;
    const fallbackKey = session.fallbackSessionKey;
    let scanCt = item.scanCt;
    let scanIv = item.scanIv;

    if (!scanCt || !scanIv) {
      try {
        const fullSub = await submissionRepository.getById(examId, item.id, key || fallbackKey);
        if (seq !== previewSeq) return;
        if (fullSub) {
          scanCt = fullSub.scanCt;
          scanIv = fullSub.scanIv;
        }
      } catch (err) {
        if (seq !== previewSeq) return;
        previewLoading = false;
        previewError = translate("scanning.errorLoadScan", { message: errorText(err) });
        return;
      }
    }

    // Two different faults: the server returned no scan bytes, or this tab holds no key to open them.
    if (!scanCt || !scanIv || (!key && !fallbackKey)) {
      previewLoading = false;
      previewError = translate(!scanCt || !scanIv ? "scanning.errorPreviewNoScan" : "scanning.errorNoSessionKey");
      return;
    }

    try {
      const decryptedBytes = await openScan(item.id, scanCt, scanIv, (key || fallbackKey)!, fallbackKey);
      if (seq !== previewSeq) return;
      const isPdf =
        decryptedBytes.length > 4 &&
        decryptedBytes[0] === 0x25 && // %
        decryptedBytes[1] === 0x50 && // P
        decryptedBytes[2] === 0x44 && // D
        decryptedBytes[3] === 0x46; // F

      previewIsPdf = isPdf;
      const mimeType = isPdf ? "application/pdf" : "image/png";
      const blob = new Blob([decryptedBytes as BlobPart], { type: mimeType });
      previewObjectUrl = URL.createObjectURL(blob);
    } catch (err) {
      if (seq !== previewSeq) return;
      console.error("Preview decryption failed:", err);
      previewError = translate("scanning.errorPreviewDecrypt");
    } finally {
      if (seq === previewSeq) previewLoading = false;
    }
  }

  function closePreview() {
    previewSeq++;
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
    previewModalOpen = false;
    previewItem = null;
    previewIsPdf = false;
    previewError = "";
  }

  /** Deletes a scan and, unless the student came from the Students page, its student record (an orphaned UNMATCHED entry otherwise). */
  async function deleteScanOf(item: ScannedSubmissionItem, group: string) {
    await submissionRepository.delete(examId, item.id, { group });
    if (!item.fromList) await studentRepository.delete({ examId, pseudonymHmac: item.pseudonymHmac, pseudonymVersion: item.pseudonymVersion }, { group });
  }

  async function handleDeleteScan(item: ScannedSubmissionItem) {
    if (!confirm(`${translate("scanning.confirmDeleteScan")}\n\n${translate("common.trashHint", { days: TRASH_DAYS })}`)) return;
    try {
      const group = newTrashGroup();
      await deleteScanOf(item, group);
      await refreshUnmatched();
      await loadScannedSubmissions();
    } catch (err: any) {
      alert(translate("scanning.errorDeleteScan", { message: err?.message || err }));
    }
  }

  function isGraded(item: ScannedSubmissionItem): boolean {
    return item.totalScore !== undefined || item.annotationCt !== undefined;
  }

  async function handleDeleteGrading(item: ScannedSubmissionItem) {
    if (!confirm(`${translate("scanning.confirmDeleteGrading")}\n\n${translate("common.trashHint", { days: TRASH_DAYS })}`)) return;
    try {
      const key = get(sessionStore).sessionKey;
      await submissionRepository.clearGrading(examId, item.id, key);
      await loadScannedSubmissions();
    } catch (err: any) {
      alert(translate("scanning.errorDeleteGrading", { message: err?.message || err }));
    }
  }

  let exportingId: string | null = $state(null);
  // The paper whose download waits for the review print choice (only papers with an objection ask).
  let reviewAsk: { item: ScannedSubmissionItem; items: GradingReviewItem[] } | null = $state.raw(null);

  async function handleExportPdf(item: ScannedSubmissionItem) {
    const items = await printableReviewOf(examId, item.id);
    if (items.length > 0) reviewAsk = { item, items };
    else await exportPdf(item);
  }

  async function exportPdf(item: ScannedSubmissionItem, review?: { items: GradingReviewItem[]; options: ReviewPrintOptions }) {
    exportingId = item.id;
    try {
      const { sessionKey, fallbackSessionKey } = get(sessionStore);
      const key = sessionKey || fallbackSessionKey;
      if (!key) throw new Error("Session not unlocked");

      const sub = await submissionRepository.getById(examId, item.id, key);
      if (!sub) throw new Error("Scan data not found");
      const scores = await scoreRepository.getBySubmissionId(examId, sub.id, key);

      const bytes = await renderGradedPdf(sub, scores, key, { fallbackKey: fallbackSessionKey, studentName: item.studentName, review });
      downloadBlob(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${item.fallbackCode || item.id}_graded.pdf`);
    } catch (err: any) {
      alert(translate("scanning.errorExportPdf", { message: err?.message || err }));
    } finally {
      exportingId = null;
    }
  }

  async function handleDeleteAllScans() {
    if (scannedSubmissions.length === 0) return;
    if (
      !confirm(
        `${translate("scanning.confirmDeleteAllScans", { count: scannedSubmissions.length })}\n\n${translate("common.trashHint", { days: TRASH_DAYS })}`
      )
    ) {
      return;
    }
    try {
      // One trash entry for the whole action (issue #125).
      const group = newTrashGroup();
      for (const item of scannedSubmissions) {
        await deleteScanOf(item, group);
      }
      await refreshUnmatched();
      await loadScannedSubmissions();
    } catch (err: any) {
      alert(translate("scanning.errorDeleteAllScans", { message: err?.message || err }));
    }
  }

  /** A failed read stops before the orphan cleanup below, which would otherwise delete students still linked. */
  async function refreshUnmatched() {
    try {
      await doRefreshUnmatched();
      readError = "";
    } catch (err) {
      console.error("Failed to refresh unmatched students:", err);
      readError = translate("scanning.errorLoadSubmissions", { message: errorText(err) });
    }
  }

  async function doRefreshUnmatched() {
    await awaitSessionReady();
    const key = get(sessionStore).sessionKey;
    const students = await studentRepository.getByExamId(examId, key);
    const submissions = await submissionRepository.getByExamId(examId, key);

    const activeKeys = new Set<string>();
    for (const sub of submissions) {
      if (sub.pseudonymHmac) activeKeys.add(await joinKey(sub));
    }

    const validUnmatched: StudentRecord[] = [];
    for (const s of students) {
      if (!s.fallbackCode || !s.fallbackCode.startsWith("UNMATCHED-") || !s.pseudonymHmac) continue;
      if (activeKeys.has(await joinKey(s))) {
        validUnmatched.push(s);
      } else {
        // Clean up orphaned unmatched student identity: housekeeping, not a teacher's delete, so no trash entry.
        await studentRepository.delete(s, { permanent: true });
      }
    }

    unmatchedList = validUnmatched.map((s) => ({
      submissionId: s.pseudonymHmac,
      studentId: s.pseudonymHmac,
      currentFallback: s.fallbackCode || "",
      newCode: "",
    }));
  }

  /** Maps the ingest module's progress events onto the panel's bar and status line. */
  function showIngestProgress(p: IngestProgress) {
    progress = p.progress;
    if (p.phase === "analyzing") {
      statusText = translate("scanning.status.analyzingFiles");
    } else if (p.phase === "scanning") {
      statusText = translate("scanning.status.scanningPage", { current: p.current, total: p.total, fileName: p.fileName });
    } else {
      statusText = translate("scanning.status.savingBooklet", { current: p.current, total: p.total, pages: p.pages });
    }
  }

  function pageNote(w: IngestWarning): string | null {
    if (w.kind === "missingPages") return translate("scanning.pageNotes.missing", { student: w.student, pages: w.pages.join(", ") });
    if (w.kind === "foreignPage") return translate("scanning.pageNotes.foreign", { fileName: w.fileName });
    return null;
  }

  function alignmentBanner(omr: OmrSummary): string {
    const fiducialDetail =
      omr.minFiducialsFound !== null
        ? translate("scanning.omrBanner.alignmentFiducialDetail", {
            found: omr.minFiducialsFound,
            missing: omr.missingCorners.join(", "),
          })
        : "";
    return translate("scanning.omrBanner.alignmentFailed", { count: omr.alignmentFailures, fiducialDetail });
  }

  async function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    isProcessing = true;
    pageNotes = [];
    paperNotes = [];
    try {
      const result = await ingestScans(Array.from(input.files), {
        examId,
        getSessionKey: () => get(sessionStore).sessionKey,
        qrPool,
        omrPool,
        getOmrContext: () => (omrAvailable ? { templates: omrTemplates, answerKeys: omrAnswerKeys } : null),
        omrSettings: get(omrSettingsStore),
        monitor,
        onProgress: showIngestProgress,
        pageCodes: get(examNavContext)?.exam?.pageCodes === true,
      });
      prepareScoreBoxTemplate();
      await refreshUnmatched();
      await loadScannedSubmissions();
      statusText = translate("scanning.status.complete", {
        fileCount: result.fileCount,
        pageCount: result.pageCount,
        bookletCount: result.bookletCount,
      });
      if (omrAvailable && result.omr.alignmentFailures > 0) omrBanner = alignmentBanner(result.omr);
      pageNotes = [...new Set(result.warnings.map(pageNote).filter((n): n is string => n !== null))];
      paperNotes = result.warnings.flatMap((w) => (w.kind === "extraPages" ? [translate("scanning.pageNotes.extra", { student: w.student, count: w.count })] : []));
    } catch (err) {
      console.error("[scan] ingest failed:", err);
      statusText = translate("scanning.status.failed", { message: err instanceof Error ? err.message : String(err) });
    } finally {
      // Always, so a failed upload never leaves the panel disabled (F9).
      isProcessing = false;
    }
  }


  async function updateFallbackCode(item: UnmatchedSubmission) {
    const code = item.newCode.trim();
    if (!code) return;
    const key = get(sessionStore).sessionKey;
    let students: StudentRecord[];
    try {
      students = await studentRepository.getByExamId(examId, key);
    } catch (err) {
      readError = translate("scanning.errorLoadSubmissions", { message: errorText(err) });
      return;
    }
    const st = students.find((s) => s.pseudonymHmac === item.studentId);
    if (st) {
      st.fallbackCode = code;
      const parsed = parseStudentQr(code);
      if (parsed) {
        st.studentName = parsed.displayName;
        st.studentNumber = parsed.studentNumber;
      }
      await saveStudentEncrypted(st, key);
      await refreshUnmatched();
      await loadScannedSubmissions();
      alert(translate("scanning.fallbackCodeUpdated", { code: st.fallbackCode }));
    }
  }

  async function handleSplitSubmission(item: ScannedSubmissionItem) {
    const input = prompt(translate("scanning.splitPrompt"));
    if (!input) return;
    const splitPage = parseInt(input, 10);
    if (isNaN(splitPage) || splitPage <= 1) {
      alert(translate("scanning.splitInvalidPage"));
      return;
    }

    const session = get(sessionStore);
    const key = session.sessionKey;
    const fallbackKey = session.fallbackSessionKey;
    let scanCt = item.scanCt;
    let scanIv = item.scanIv;

    if (!scanCt || !scanIv) {
      try {
        const fullSub = await submissionRepository.getById(examId, item.id, key || fallbackKey);
        if (fullSub) {
          scanCt = fullSub.scanCt;
          scanIv = fullSub.scanIv;
        }
      } catch (err) {
        readError = translate("scanning.errorLoadScan", { message: errorText(err) });
        return;
      }
    }

    if (!scanCt || !scanIv || (!key && !fallbackKey)) {
      alert(translate(!scanCt || !scanIv ? "scanning.splitNoScan" : "scanning.errorNoSessionKey"));
      return;
    }

    try {
      const activeKey = (key || fallbackKey)!;
      const decryptedBytes = await openScan(item.id, scanCt, scanIv, activeKey, fallbackKey);

      const pdfLib = await import("pdf-lib");
      const { PDFDocument } = pdfLib;
      const srcPdf = await PDFDocument.load(decryptedBytes, { ignoreEncryption: true });
      const totalPages = srcPdf.getPageCount();

      if (splitPage > totalPages) {
        alert(translate("scanning.splitExceedsPages", { splitPage, totalPages }));
        return;
      }

      // PDF 1: pages 0 to splitPage - 2
      const pdf1 = await PDFDocument.create();
      const indices1 = Array.from({ length: splitPage - 1 }, (_, i) => i);
      const copied1 = await pdf1.copyPages(srcPdf, indices1);
      copied1.forEach((p) => pdf1.addPage(p));
      // Both parts keep the attached original A3 scan (issue #220): it is never dropped.
      await carryAttachments(pdfLib, srcPdf, pdf1);
      const buf1 = await pdf1.save();

      // PDF 2: pages splitPage - 1 to totalPages - 1
      const pdf2 = await PDFDocument.create();
      const indices2 = Array.from({ length: totalPages - splitPage + 1 }, (_, i) => i + splitPage - 1);
      const copied2 = await pdf2.copyPages(srcPdf, indices2);
      copied2.forEach((p) => pdf2.addPage(p));
      await carryAttachments(pdfLib, srcPdf, pdf2);
      const buf2 = await pdf2.save();

      // Ids first: each part's ciphertext is bound to its submission (AAD, issue #178).
      const part2SubId = crypto.randomUUID();
      const part1 = activeKey ? await sealScan(item.id, buf1, activeKey) : undefined;
      const part2 = activeKey ? await sealScan(part2SubId, buf2, activeKey) : undefined;

      // Update existing submission with Part 1
      await saveSubmissionEncrypted(
        {
          id: item.id,
          examId,
          pseudonymHmac: item.pseudonymHmac,
          pseudonymVersion: item.pseudonymVersion,
          scanCt: part1?.ct,
          scanIv: part1?.iv || new Uint8Array(12),
          createdAt: item.createdAt,
        },
        activeKey,
      );

      // Create new unmatched student & submission record for Part 2
      const part2Pseudonym = await pseudonymFor(examId, crypto.randomUUID());
      const part2Fallback = `UNMATCHED-${randomCode()}`;

      await saveStudentEncrypted(
        {
          ...part2Pseudonym,
          examId,
          fallbackCode: part2Fallback,
          piiCt: new Uint8Array([0]),
          piiIv: new Uint8Array(12),
        },
        activeKey,
      );

      await saveSubmissionEncrypted(
        {
          id: part2SubId,
          examId,
          pseudonymHmac: part2Pseudonym.pseudonymHmac,
          pseudonymVersion: part2Pseudonym.pseudonymVersion,
          scanCt: part2?.ct,
          scanIv: part2?.iv || new Uint8Array(12),
          createdAt: new Date().toISOString(),
        },
        activeKey,
      );

      await refreshUnmatched();
      await loadScannedSubmissions();
      alert(
        translate("scanning.splitSuccess", {
          firstEnd: splitPage - 1,
          secondStart: splitPage,
          totalPages,
        })
      );
    } catch (err: any) {
      console.error("Split submission failed:", err);
      alert(translate("scanning.splitError", { message: err?.message || err }));
    }
  }
</script>

<PageShell width="fluid">
  <ExamPageHeader {examId} step="scan" title={$t("scanning.pageTitle")} helpTopic="scanning" />

  {#if omrBanner}
    <Alert severity="warning" class="my-4">{omrBanner}</Alert>
  {/if}
  {#if pageNotes.length}
    <Alert severity="warning" class="my-4" title={$t("scanning.pageNotes.title")}>
      <ul class="m-0 ps-5">{#each pageNotes as note (note)}<li>{note}</li>{/each}</ul>
    </Alert>
  {/if}
  {#if paperNotes.length}
    <Alert severity="info" class="my-4" title={$t("scanning.pageNotes.paperTitle")}>
      <ul class="m-0 ps-5">{#each paperNotes as note (note)}<li>{note}</li>{/each}</ul>
    </Alert>
  {/if}

  <UploadPanel {isProcessing} {progress} {statusText} disabledReason={$examNavContext?.exam?.digitalGrading === false ? $t("exam.layout.grading.off") : ""} onFileUpload={handleFileUpload}>
    <HardwareProfileCard {hwProfile} inConstrainedMode={monitor?.inConstrainedMode} />
  </UploadPanel>

  {#if readError}
    <Alert severity="danger" class="my-4" onDismiss={() => (readError = "")}>{readError}</Alert>
  {/if}

  <UnmatchedResolver {unmatchedList} onUpdateFallbackCode={updateFallbackCode} />

  {#if submissionsLoadError}
    <Alert severity="danger" class="my-4">
      {submissionsLoadError}
      {#snippet actions()}
        <Button variant="outlined" severity="danger" size="sm" onClick={loadScannedSubmissions}>{$t("common.retry")}</Button>
      {/snippet}
    </Alert>
  {:else}
    <ScannedSubmissionsTable
      {examId}
      {scannedSubmissions}
      loading={isLoadingSubmissions}
      {exportingId}
      {isGraded}
      onPreview={openPreview}
      onExportPdf={handleExportPdf}
      onSplit={handleSplitSubmission}
      onDeleteGrading={handleDeleteGrading}
      onDelete={handleDeleteScan}
      onDeleteAll={handleDeleteAllScans}
    />
  {/if}
</PageShell>

{#if reviewAsk}
  {@const ask = reviewAsk}
  <GradedPdfDialog
    onClose={() => (reviewAsk = null)}
    onConfirm={(options) => {
      reviewAsk = null;
      exportPdf(ask.item, { items: ask.items, options });
    }}
  />
{/if}

<ScanPreviewModal
  open={previewModalOpen}
  item={previewItem}
  objectUrl={previewObjectUrl}
  isPdf={previewIsPdf}
  loading={previewLoading}
  error={previewError}
  onClose={closePreview}
/>
