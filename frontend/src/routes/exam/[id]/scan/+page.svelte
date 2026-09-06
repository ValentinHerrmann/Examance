<script lang="ts">
  import { page } from "$app/stores";
  import { loadPdfjs } from "$lib/pdf/pdfjs";
  export let params;
  import { goto } from "$app/navigation";
  import { browser } from "$app/environment";
  import {
    detectHardware,
    PipelineMonitor,
    type HardwareProfile,
  } from "$lib/hardware/detect";
  import { db } from "$lib/db/db";
  import { encrypt, decrypt, uint8ArrayToBase64 } from "$lib/crypto/aesGcm";
  import { ensure64CharHex } from "$lib/crypto/hmac";
  import { sessionStore } from "$lib/stores/session";
  import { storagePolicyStore } from "$lib/stores/storagePolicy";
  import {
    loadStudentsEncrypted,
    saveStudentEncrypted,
    saveSubmissionEncrypted,
    decryptStudent,
    loadExamExercisesEncrypted,
    loadOmrTemplateEncrypted,
    saveScoreEncrypted,
    loadScoresEncrypted,
    loadLocalMcGroups,
  } from "$lib/db/dbEncryption";
  import { computeMcExercisesHash, loadExamMcExercises } from "$lib/grading/mcExerciseHash";
  import { prepareOmrTemplate, loadExamCompileContext } from "$lib/grading/omrTemplatePrep";
  import { isMcQuestion } from "$lib/grading/mcScore";
  import { drawOmrOverlayForPage, type McOverlayState } from "$lib/grading/omrOverlay";
  import { api } from "$lib/api/client";
  import { submissionRepository } from "$lib/repositories/submissionRepository";
  import { studentRepository } from "$lib/repositories/studentRepository";
  import type { StudentRecord, OmrPageTemplate } from "$lib/db/schema";
  import { onMount, onDestroy } from "svelte";
  import { get } from "svelte/store";
  import { WorkerPool } from "$lib/workers/pool";
  import type {
    QrWorkerRequest,
    QrWorkerResponse,
  } from "$lib/workers/qrWorker";
  import type {
    OmrWorkerRequest,
    OmrWorkerResponse,
    OmrExerciseResult,
    OmrExerciseAnswerKey,
  } from "$lib/workers/omrWorker";
  import { parseStudentQr } from "$lib/utils/studentQr";
  import ConfirmDialog from "$lib/components/ConfirmDialog.svelte";
  import type { PDFDocument, PDFPage } from "pdf-lib";
  import HardwareProfileCard from "$lib/components/scanning/HardwareProfileCard.svelte";
  import UploadPanel from "$lib/components/scanning/UploadPanel.svelte";
  import { PageHeader, PageShell } from "$lib/components/ui";
  import UnmatchedResolver from "$lib/components/scanning/UnmatchedResolver.svelte";
  import ScannedSubmissionsTable from "$lib/components/scanning/ScannedSubmissionsTable.svelte";
  import ScanPreviewModal from "$lib/components/scanning/ScanPreviewModal.svelte";
  import { t, translate } from "$lib/i18n";

  const examId = $page.params.id || "";

  let hwProfile: HardwareProfile = {
    logicalCores: 4,
    estimatedRAMGB: 8,
    simdSupported: true,
    fileSystemAccessAPI: true,
    recommendedMode: "parallel",
  };
  let monitor: PipelineMonitor;
  let isProcessing = false;
  let progress = 0;
  let statusText = translate("scanning.status.ready");
  let scannedCount = 0;

  interface UnmatchedSubmission {
    submissionId: string;
    studentId: string;
    currentFallback: string;
    newCode: string;
  }

  interface PdfPageRef {
    doc: PDFDocument;
    index: number;
  }

  interface ScannedSubmissionItem {
    id: string;
    pseudonymHash: string;
    fallbackCode: string;
    studentName?: string;
    studentNumber?: string;
    createdAt: string;
    scanCt?: Uint8Array;
    scanIv?: Uint8Array;
    totalScore?: number;
    annotationCt?: Uint8Array;
    annotationIv?: Uint8Array;
  }

  let unmatchedList: UnmatchedSubmission[] = [];
  let scannedSubmissions: ScannedSubmissionItem[] = [];
  let previewModalOpen = false;
  let previewItem: ScannedSubmissionItem | null = null;
  let previewObjectUrl: string | null = null;
  let previewIsPdf = false;
  let previewLoading = false;
  let previewError = "";
  let qrPool: WorkerPool<QrWorkerRequest, QrWorkerResponse> | null = null;
  let omrPool: WorkerPool<OmrWorkerRequest, OmrWorkerResponse> | null = null;

  /** Per-page bubble/fiducial rects captured by "Prepare OMR" on the exam page; empty if unavailable. */
  let omrTemplatePages: OmrPageTemplate[] = [];
  let omrAnswerKeys: OmrExerciseAnswerKey[] = [];
  let omrAvailable = false;
  let omrBanner = "";

  /** Loads the exam's OMR template + MC answer key, gating auto-grading on a fresh (non-stale) template. */
  async function loadOmrContext() {
    const key = get(sessionStore).sessionKey;
    try {
      const mcExercises = await loadExamMcExercises(examId, key);
      if (mcExercises.length === 0) {
        omrAvailable = false;
        omrBanner = "";
        return;
      }
      const existing = await loadOmrTemplateEncrypted(examId, key);
      let needsCompile = !existing || !existing.payload;

      if (!needsCompile) {
        const currentHash = await computeMcExercisesHash(mcExercises);
        if (existing!.record.exercisesHash !== currentHash) {
          needsCompile = true;
        }
      }

      let pages: OmrPageTemplate[];
      if (needsCompile) {
        const compileCtx = await loadExamCompileContext(examId, key);
        if (!compileCtx) {
          omrAvailable = false;
          omrBanner = translate("scanning.omrBanner.autoPrepareFailed", { message: translate("scanning.examContextNotFound") });
          return;
        }

        try {
          omrBanner = translate("scanning.omrBanner.autoPreparing");
          const compileRes = await prepareOmrTemplate({
            examId,
            exam: compileCtx.exam,
            exercises: compileCtx.exercises,
            libraryExercises: compileCtx.libraryExercises,
            mcGroups: compileCtx.mcGroups,
            key,
            onProgress: (msg) => { omrBanner = `${translate("scanning.omrBanner.autoPreparing")} - ${msg}`; }
          });

          if (compileRes.status === 'stale') {
             omrAvailable = false;
             omrBanner = translate("scanning.omrBanner.autoPrepareFailed", { message: compileRes.message });
             return;
          }

          pages = compileRes.pages;
          omrBanner = translate("scanning.omrBanner.autoPrepared");
        } catch (err: any) {
          omrAvailable = false;
          omrBanner = translate("scanning.omrBanner.autoPrepareFailed", { message: err.message });
          return;
        }
      } else {
        pages = existing!.payload!.pages;
      }

      omrTemplatePages = pages;
      omrAnswerKeys = mcExercises.map((e) => ({
        exerciseId: e.id,
        questionType: e.questionType as "mc" | "sc" | "tf",
        correctAnswers: e.correctAnswers ?? [],
        penalty: e.penalty ?? 0,
        maxPoints: e.maxPoints,
      }));
      omrAvailable = true;
      if (!needsCompile) omrBanner = "";
    } catch (err) {
      console.error("Failed to load OMR context:", err);
      omrAvailable = false;
      omrBanner = "";
    }
  }

  onMount(() => {
    if (browser) {
      hwProfile = detectHardware();
      monitor = new PipelineMonitor(hwProfile);
      monitor.on("downgrade", () => {
        statusText = translate("scanning.status.memoryDowngraded");
      });
      qrPool = new WorkerPool(
        () =>
          new Worker(new URL("$lib/workers/qrWorker.ts", import.meta.url), {
            type: "module",
          }),
        monitor,
      );
      omrPool = new WorkerPool(
        () =>
          new Worker(new URL("$lib/workers/omrWorker.ts", import.meta.url), {
            type: "module",
          }),
        monitor,
      );
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
    const key = get(sessionStore).sessionKey;
    const submissions = await submissionRepository.getByExamId(examId, key);
    const students = await studentRepository.getByExamId(examId, key);

    const studentMap = new Map<string, StudentRecord>();
    for (const st of students) {
      if (st.pseudonymId) {
        studentMap.set(st.pseudonymId, st);
        const hex = await ensure64CharHex(st.pseudonymId);
        studentMap.set(hex, st);
      }
      if (st.fallbackCode) {
        studentMap.set(st.fallbackCode, st);
      }
    }

    const items: ScannedSubmissionItem[] = [];
    for (const sub of submissions) {
      let st = studentMap.get(sub.pseudonymHash);
      if (!st) {
        const hex = await ensure64CharHex(sub.pseudonymHash);
        st = studentMap.get(hex);
      }

      let sName = st?.studentName;
      let sNumber = st?.studentNumber;
      let fCode = st?.fallbackCode;

      const qrCandidate =
        (st?.pseudonymId && st.pseudonymId.includes('_') ? st.pseudonymId : null) ||
        (sub.pseudonymHash && sub.pseudonymHash.includes('_') ? sub.pseudonymHash : null) ||
        (fCode && fCode.includes('_') ? fCode : null);

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
        fCode = sName || (sub.pseudonymHash.length > 16 ? sub.pseudonymHash.substring(0, 8) : sub.pseudonymHash);
      }

      items.push({
        id: sub.id,
        pseudonymHash: sub.pseudonymHash,
        fallbackCode: fCode,
        studentName: sName,
        studentNumber: sNumber,
        createdAt: sub.createdAt || new Date().toISOString(),
        scanCt: sub.scanCt,
        scanIv: sub.scanIv,
        totalScore: sub.totalScore,
        annotationCt: sub.annotationCt,
        annotationIv: sub.annotationIv,
      });
    }

    scannedSubmissions = items;
  }

  async function openPreview(item: ScannedSubmissionItem) {
    closePreview();
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
      const fullSub = await submissionRepository.getById(examId, item.id, key || fallbackKey);
      if (fullSub) {
        scanCt = fullSub.scanCt;
        scanIv = fullSub.scanIv;
      }
    }

    if (!scanCt || !scanIv || (!key && !fallbackKey)) {
      previewLoading = false;
      previewError = translate("scanning.errorPreviewMissingData");
      return;
    }

    try {
      const decryptedBytes = await decrypt(key || fallbackKey, scanCt, scanIv, fallbackKey);
      const isPdf =
        decryptedBytes.length > 4 &&
        decryptedBytes[0] === 0x25 && // %
        decryptedBytes[1] === 0x50 && // P
        decryptedBytes[2] === 0x44 && // D
        decryptedBytes[3] === 0x46; // F

      previewIsPdf = isPdf;
      const mimeType = isPdf ? "application/pdf" : "image/png";
      const blob = new Blob([decryptedBytes as unknown as BlobPart], { type: mimeType });
      previewObjectUrl = URL.createObjectURL(blob);
    } catch (err) {
      console.error("Preview decryption failed:", err);
      previewError = translate("scanning.errorPreviewDecrypt");
    } finally {
      previewLoading = false;
    }
  }

  function closePreview() {
    if (previewObjectUrl) {
      URL.revokeObjectURL(previewObjectUrl);
      previewObjectUrl = null;
    }
    previewModalOpen = false;
    previewItem = null;
    previewIsPdf = false;
    previewError = "";
  }

  async function handleDeleteScan(item: ScannedSubmissionItem) {
    if (!confirm(translate("scanning.confirmDeleteScan"))) return;
    try {
      await submissionRepository.delete(examId, item.id);
      // Also remove the associated student record to prevent orphaned UNMATCHED entries
      await studentRepository.delete(examId, item.pseudonymHash);
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
    if (!confirm(translate("scanning.confirmDeleteGrading"))) return;
    try {
      const key = get(sessionStore).sessionKey;
      await submissionRepository.clearGrading(examId, item.id, key);
      await loadScannedSubmissions();
    } catch (err: any) {
      alert(translate("scanning.errorDeleteGrading", { message: err?.message || err }));
    }
  }

  let exportingId: string | null = null;

  function drawStrokesOnCanvas(ctx: CanvasRenderingContext2D, strokes: any[]) {
    for (const stroke of strokes) {
      ctx.strokeStyle = "#ef4444";
      ctx.fillStyle = "#ef4444";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";
      if (stroke.tool === "pen") {
        ctx.beginPath();
        stroke.points.forEach((p: any, idx: number) => {
          if (idx === 0) ctx.moveTo(p.x, p.y);
          else ctx.lineTo(p.x, p.y);
        });
        ctx.stroke();
      } else if (stroke.tool === "line") {
        if (stroke.points.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
          ctx.lineTo(stroke.points[1].x, stroke.points[1].y);
          ctx.stroke();
        }
      } else if (stroke.tool === "check_full" || stroke.tool === "check") {
        const p = stroke.points[0];
        ctx.beginPath();
        ctx.moveTo(p.x - 14, p.y - 2);
        ctx.lineTo(p.x - 4, p.y + 10);
        ctx.lineTo(p.x + 16, p.y - 18);
        ctx.stroke();
      } else if (stroke.tool === "check_half") {
        const p = stroke.points[0];
        ctx.beginPath();
        ctx.moveTo(p.x - 14, p.y - 2);
        ctx.lineTo(p.x - 4, p.y + 10);
        ctx.lineTo(p.x + 16, p.y - 18);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x + 1, p.y - 12);
        ctx.lineTo(p.x + 11, p.y - 2);
        ctx.stroke();
      } else if (stroke.tool === "check_quarter") {
        const p = stroke.points[0];
        ctx.beginPath();
        ctx.moveTo(p.x - 14, p.y - 2);
        ctx.lineTo(p.x - 4, p.y + 10);
        ctx.lineTo(p.x + 16, p.y - 18);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x - 2, p.y - 13);
        ctx.lineTo(p.x + 8, p.y - 3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x + 5, p.y - 13);
        ctx.lineTo(p.x + 15, p.y - 3);
        ctx.stroke();
      } else if (stroke.tool === "minus_full") {
        ctx.font = "bold 26px sans-serif";
        ctx.fillText("-1BE", stroke.points[0].x, stroke.points[0].y);
      } else if (stroke.tool === "minus_half") {
        ctx.font = "bold 26px sans-serif";
        ctx.fillText("-0,5BE", stroke.points[0].x, stroke.points[0].y);
      } else if (stroke.tool === "minus_quarter") {
        ctx.font = "bold 26px sans-serif";
        ctx.fillText("-0,25BE", stroke.points[0].x, stroke.points[0].y);
      } else if (stroke.tool === "wrong" || stroke.tool === "cross") {
        ctx.font = "bold italic 30px serif";
        ctx.fillText("f", stroke.points[0].x, stroke.points[0].y);
      } else if (stroke.tool === "missing") {
        const p = stroke.points[0];
        ctx.beginPath();
        ctx.moveTo(p.x - 12, p.y - 18);
        ctx.lineTo(p.x, p.y + 4);
        ctx.lineTo(p.x + 12, p.y - 18);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x - 15, p.y - 8);
        ctx.lineTo(p.x + 15, p.y - 8);
        ctx.stroke();
      } else if (stroke.tool === "wf") {
        ctx.font = "bold 24px sans-serif";
        ctx.fillText("WF", stroke.points[0].x, stroke.points[0].y);
      } else if (stroke.tool === "ff") {
        ctx.font = "bold 24px sans-serif";
        ctx.fillText("FF", stroke.points[0].x, stroke.points[0].y);
      }
    }
  }

  async function handleExportPdf(item: ScannedSubmissionItem) {
    exportingId = item.id;
    try {
      const session = get(sessionStore);
      const key = session.sessionKey;
      const fallbackKey = session.fallbackSessionKey;
      if (!key && !fallbackKey) throw new Error("Session not unlocked");

      const sub = await submissionRepository.getById(examId, item.id, key || fallbackKey);
      if (!sub?.scanCt || !sub.scanIv) throw new Error("Scan data not found");

      const scanBytes = await decrypt(key || fallbackKey, sub.scanCt, sub.scanIv, fallbackKey);

      // Load annotations
      let strokes: any[] = [];
      if (sub.annotationCt && sub.annotationIv) {
        const annBytes = await decrypt(key || fallbackKey, sub.annotationCt, sub.annotationIv, fallbackKey);
        strokes = JSON.parse(new TextDecoder().decode(annBytes));
      }

      // Load MC/SC/TF auto-grading overlay data (mirrors ScanCanvasViewer's gradingStore
      // state) so the exported PDF shows the same OMR annotations as the grading UI.
      const exercises = await loadExamExercisesEncrypted(examId, key || fallbackKey);
      const scores = await loadScoresEncrypted(sub.id, key || fallbackKey);
      const mcState: Record<string, McOverlayState> = {};
      const scoreInputs: Record<string, number | null | undefined> = {};
      for (const sc of scores) {
        if (sc.omrMeta) mcState[sc.exerciseId] = { omrMeta: sc.omrMeta };
        scoreInputs[sc.exerciseId] = sc.score;
      }
      const mcGroups = await loadLocalMcGroups(examId).catch(() => []);
      const subExerciseLetters = new Map<string, string>();
      for (const group of mcGroups) {
        group.memberIds.forEach((exerciseId, idx) => {
          subExerciseLetters.set(exerciseId, String.fromCharCode(97 + idx));
        });
      }

      const { PDFDocument } = await import("pdf-lib");
      const outputPdf = await PDFDocument.create();

      // Helper: convert canvas to PNG bytes
      const canvasToPng = (canvas: HTMLCanvasElement): Promise<Uint8Array> =>
        new Promise((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (!blob) { reject(new Error("Canvas export failed")); return; }
            blob.arrayBuffer().then((buf) => resolve(new Uint8Array(buf))).catch(reject);
          }, "image/png");
        });

      // Helper: load Uint8Array as HTMLImageElement
      const loadImageFromBytes = (bytes: Uint8Array): Promise<HTMLImageElement> =>
        new Promise((resolve, reject) => {
          const blob = new Blob([bytes as unknown as BlobPart], { type: "image/png" });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
          img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
          img.src = url;
        });

      // Detect whether scanBytes is a PDF or an image
      const isPdf =
        scanBytes.length > 4 &&
        scanBytes[0] === 0x25 && // %
        scanBytes[1] === 0x50 && // P
        scanBytes[2] === 0x44 && // D
        scanBytes[3] === 0x46; // F

      if (isPdf) {
        // Original PDF path: render each page with pdf.js, draw annotations, embed as PNG
        const pdfjsLib = await loadPdfjs();

        const pdfDoc = await pdfjsLib.getDocument({ data: scanBytes }).promise;

        for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
          const pdfPage = await pdfDoc.getPage(pageNum);
          const viewport = pdfPage.getViewport({ scale: 2 });

          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;

          await pdfPage.render({ canvasContext: ctx, canvas, viewport } as any).promise;

          const pageStrokes = strokes.filter((s: any) => (s.pageNumber ?? 1) === pageNum);
          if (pageStrokes.length > 0) {
            drawStrokesOnCanvas(ctx, pageStrokes);
          }
          drawOmrOverlayForPage(ctx, canvas.width, canvas.height, pageNum, mcState, exercises, subExerciseLetters, scoreInputs);

          const pngBytes = await canvasToPng(canvas);
          const pngImage = await outputPdf.embedPng(pngBytes);
          // use half the canvas size (scale=2) as the PDF page dimensions in pt
          const outPage = outputPdf.addPage([viewport.width / 2, viewport.height / 2]);
          outPage.drawImage(pngImage, { x: 0, y: 0, width: viewport.width / 2, height: viewport.height / 2 });
        }
      } else {
        // Image path (default for ingested scans): load image, draw annotations, embed directly
        const img = await loadImageFromBytes(scanBytes);
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);

        const pageStrokes = strokes.filter((s: any) => (s.pageNumber ?? 1) === 1);
        if (pageStrokes.length > 0) {
          drawStrokesOnCanvas(ctx, pageStrokes);
        }
        drawOmrOverlayForPage(ctx, canvas.width, canvas.height, 1, mcState, exercises, subExerciseLetters, scoreInputs);

        const pngBytes = await canvasToPng(canvas);
        const pngImage = await outputPdf.embedPng(pngBytes);

        // Convert pixel dimensions to PDF points at 72 DPI.
        // Scanned images are rendered at scale=2 (~192 DPI from a 96 DPI base),
        // so scale down to obtain a natural page size in points.
        const dpi = 192;
        const pageWidth = img.width * (72 / dpi);
        const pageHeight = img.height * (72 / dpi);
        const outPage = outputPdf.addPage([pageWidth, pageHeight]);
        outPage.drawImage(pngImage, { x: 0, y: 0, width: pageWidth, height: pageHeight });
      }

      const pdfBytes = await outputPdf.save();
      const blob = new Blob([pdfBytes as unknown as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${item.fallbackCode || item.id}_graded.pdf`;
      a.click();
      URL.revokeObjectURL(url);
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
        translate("scanning.confirmDeleteAllScans", { count: scannedSubmissions.length })
      )
    ) {
      return;
    }
    try {
      for (const item of scannedSubmissions) {
        await submissionRepository.delete(examId, item.id);
        // Also remove the associated student record to prevent orphaned UNMATCHED entries
        await studentRepository.delete(examId, item.pseudonymHash);
      }
      await refreshUnmatched();
      await loadScannedSubmissions();
    } catch (err: any) {
      alert(translate("scanning.errorDeleteAllScans", { message: err?.message || err }));
    }
  }

  async function combinePageBuffers(pageBuffers: Uint8Array[]): Promise<Uint8Array> {
    if (pageBuffers.length === 1) return pageBuffers[0];
    const images = await Promise.all(
      pageBuffers.map((buf) => {
        return new Promise<HTMLImageElement>((resolve, reject) => {
          const blob = new Blob([buf.buffer as ArrayBuffer], { type: "image/png" });
          const url = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
          };
          img.onerror = (err) => {
            URL.revokeObjectURL(url);
            reject(err);
          };
          img.src = url;
        });
      })
    );

    const totalHeight = images.reduce((acc, img) => acc + img.height, 0);
    const maxWidth = Math.max(...images.map((img) => img.width));
    const canvas = document.createElement("canvas");
    canvas.width = maxWidth;
    canvas.height = totalHeight;
    const ctx = canvas.getContext("2d")!;

    let currentY = 0;
    for (const img of images) {
      ctx.drawImage(img, 0, currentY);
      currentY += img.height;
    }

    const blob: Blob = await new Promise((res) =>
      canvas.toBlob((b) => res(b!), "image/png")
    );
    return new Uint8Array(await blob.arrayBuffer());
  }

  async function refreshUnmatched() {
    const key = get(sessionStore).sessionKey;
    const students = await studentRepository.getByExamId(examId, key);
    const submissions = await submissionRepository.getByExamId(examId, key);

    const activeHashes = new Set<string>();
    for (const sub of submissions) {
      if (sub.pseudonymHash) {
        activeHashes.add(sub.pseudonymHash);
        activeHashes.add(await ensure64CharHex(sub.pseudonymHash));
      }
    }

    const validUnmatched: StudentRecord[] = [];
    for (const s of students) {
      if (!s.fallbackCode || !s.fallbackCode.startsWith("UNMATCHED-")) continue;
      const hmac = s.pseudonymId ? await ensure64CharHex(s.pseudonymId) : "";
      const isLinkedToSubmission =
        (s.pseudonymId && activeHashes.has(s.pseudonymId)) ||
        (hmac && activeHashes.has(hmac));

      if (isLinkedToSubmission) {
        validUnmatched.push(s);
      } else if (s.pseudonymId) {
        // Clean up orphaned unmatched student identity
        await studentRepository.delete(examId, s.pseudonymId);
      }
    }

    unmatchedList = validUnmatched.map((s) => ({
      submissionId: s.pseudonymId,
      studentId: s.pseudonymId,
      currentFallback: s.fallbackCode || "",
      newCode: "",
    }));
  }

  async function loadImageData(
    file: File,
  ): Promise<{ imageData: ImageData; buffer: Uint8Array }> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, img.width, img.height);
        URL.revokeObjectURL(url);

        canvas.toBlob(async (blob) => {
          if (!blob) {
            reject(new Error("Canvas blob generation failed"));
            return;
          }
          const buffer = new Uint8Array(await blob.arrayBuffer());
          resolve({ imageData, buffer });
        }, "image/png");
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error(`Failed to load image file: ${file.name}`));
      };

      img.src = url;
    });
  }

  async function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    isProcessing = true;
    progress = 0;
    const files = Array.from(input.files);

    interface StudentBooklet {
      pseudonymId: string;
      fallbackCode: string;
      studentName?: string;
      studentNumber?: string;
      isUnmatched: boolean;
      pageRefs: PdfPageRef[];
    }

    const booklets: StudentBooklet[] = [];
    let processedPages = 0;
    let totalPagesCount = 0;
    let omrAlignmentFailures = 0;
    let omrMinFiducialsFound: number | null = null;
    const omrMissingCorners = new Set<string>();
    const CORNER_NAMES = ["bottom-left", "bottom-right", "top-right", "top-left"];
    /** Accumulates OMR results per booklet across all its pages, merged into scores once subId exists. */
    const omrResultsByPseudonym = new Map<string, OmrExerciseResult[]>();

    // --- PASS 1: Calculate total pages for progress bar ---
    const fileInfos: any[] = [];
    statusText = translate("scanning.status.analyzingFiles");

    for (const file of files) {
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        try {
          const pdfjsLib = await loadPdfjs();
          // `{ data }` hands pdf.js the bytes directly. The earlier `{ url:
          // URL.createObjectURL(file) }` made pdf.js issue its own internal
          // fetch against the blob: URL, which is connect-src-governed (not
          // img-src) and got blocked by CSP — img-src already allows blob:,
          // but nothing here was an image load. Matches the PASS 2 pattern
          // a few hundred lines below, which never had this problem.
          const fileBytes = new Uint8Array(await file.arrayBuffer());
          const loadingTask = pdfjsLib.getDocument({ data: fileBytes });
          const pdf = await loadingTask.promise;

          totalPagesCount += pdf.numPages;
          fileInfos.push({ file, type: "pdf", pdf, loadingTask });
        } catch (pdfErr) {
          console.error("Failed to load PDF:", pdfErr);
        }
      } else {
        totalPagesCount += 1;
        fileInfos.push({ file, type: "image" });
      }
    }

    // --- PASS 2: Extract & Process Iteratively ---
    let currentBooklet: StudentBooklet | null = null;

    for (let i = 0; i < fileInfos.length; i++) {
      const info = fileInfos[i];
      const fileName = info.file.name;

      // --- HELPER: Process Single Page ---
      async function processScannedPage(fileName: string, imageData: ImageData, pageRef: PdfPageRef) {
        processedPages++;
        progress = Math.round((processedPages / Math.max(totalPagesCount, 1)) * 50);
        statusText = translate("scanning.status.scanningPage", {
          current: processedPages,
          total: totalPagesCount,
          fileName,
        });

        let qrResult: QrWorkerResponse | null = null;
        if (qrPool) {
          try {
            const res = await qrPool.dispatch({
              type: "QR_DECODE",
              imageData: imageData,
            });
            if (res.type === "QR_RESULT") {
              qrResult = res;
            }
          } catch {
            // No QR on this page
          }
        }

        if (qrResult) {
          const pseudoId: string = qrResult.pseudonymId;
          const parsedStudent = parseStudentQr(pseudoId) || (qrResult.rawText ? parseStudentQr(qrResult.rawText) : null);
          const fallbackCode =
            (parsedStudent ? parsedStudent.displayName : null) ||
            qrResult.fallbackCode ||
            `F-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

          if (currentBooklet && currentBooklet.pseudonymId === pseudoId) {
            currentBooklet.pageRefs.push(pageRef);
          } else {
            const existingBooklet = booklets.find((b) => b.pseudonymId === pseudoId);
            if (existingBooklet) {
              currentBooklet = existingBooklet;
              currentBooklet.pageRefs.push(pageRef);
            } else {
              const newBooklet: StudentBooklet = {
                pseudonymId: pseudoId,
                fallbackCode,
                studentName: parsedStudent?.displayName,
                studentNumber: parsedStudent?.studentNumber,
                isUnmatched: false,
                pageRefs: [pageRef],
              };
              booklets.push(newBooklet);
              currentBooklet = newBooklet;
            }
          }
        } else {
          // No QR code detected on this page: append to current active booklet or start unmatched booklet
          if (currentBooklet) {
            currentBooklet.pageRefs.push(pageRef);
          } else {
            const pseudoId: string = crypto.randomUUID();
            const newBooklet: StudentBooklet = {
              pseudonymId: pseudoId,
              fallbackCode: `UNMATCHED-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
              isUnmatched: true,
              pageRefs: [pageRef],
            };
            booklets.push(newBooklet);
            currentBooklet = newBooklet;
          }
        }

        // Reuse the imageData already rasterized for QR decode — no second pass, no second
        // rasterization. Position within the booklet maps 1:1 to the blank template's page
        // index, since a scanned booklet is expected to follow the exam's own page order.
        if (omrPool && omrAvailable && currentBooklet) {
          const pageIndexInBooklet = currentBooklet.pageRefs.length - 1;
          const pageTemplate = omrTemplatePages[pageIndexInBooklet];
          if (pageTemplate && (pageTemplate.bubbles.length > 0 || pageTemplate.fiducials.length > 0)) {
            try {
              const omrRes = await omrPool.dispatch({
                type: "OMR_PROCESS",
                imageData,
                pageTemplate,
                scanScale: 2.0,
                answerKeys: omrAnswerKeys,
              });
              if (omrRes.type === "OMR_RESULT") {
                const list = omrResultsByPseudonym.get(currentBooklet.pseudonymId) ?? [];
                list.push(...omrRes.results);
                omrResultsByPseudonym.set(currentBooklet.pseudonymId, list);
                if (omrRes.alignmentFailed) omrAlignmentFailures++;
                omrMinFiducialsFound =
                  omrMinFiducialsFound === null
                    ? omrRes.fiducialsFound
                    : Math.min(omrMinFiducialsFound, omrRes.fiducialsFound);
                if (omrRes.fiducialCorners) {
                  for (let c = 0; c < 4; c++) {
                    if (!omrRes.fiducialCorners.includes(c)) {
                      omrMissingCorners.add(CORNER_NAMES[c]);
                    }
                  }
                }
              }
            } catch (omrErr) {
              console.warn(`OMR processing failed for page in ${fileName}:`, omrErr);
            }
          }
        }

        monitor?.checkMemoryHealth();
      }

      if (info.type === "pdf") {
        const pdfJsDoc = info.pdf;

        // Load the same file with pdf-lib for page copying
        const fileBytes = await info.file.arrayBuffer();
        const { PDFDocument: PDFDocClass } = await import("pdf-lib");
        const pdfLibDoc = await PDFDocClass.load(fileBytes, { ignoreEncryption: true });
        const numPages = pdfJsDoc.numPages;

        for (let pIdx = 1; pIdx <= numPages; pIdx++) {
          const page = await pdfJsDoc.getPage(pIdx);
          const viewport = page.getViewport({ scale: 2.0 }); // ~200 DPI
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, canvas, viewport } as any).promise;

          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          // Reference the page in the pdf-lib document (0-based index)
          const pageRef: PdfPageRef = { doc: pdfLibDoc, index: pIdx - 1 };

          // Scan and group immediately, dropping imageData after use
          await processScannedPage(fileName, imageData, pageRef);

          // Clean up page resources
          page.cleanup();
        }

        // Clean up PDF.js resources
        await info.loadingTask.destroy();

      } else {
        // Image files are no longer supported — skip with warning
        console.warn(`Skipping unsupported file type (image): ${fileName}. Only PDF files are supported.`);
      }
    }

    let newlyIngestedCount = 0;
    for (let bIdx = 0; bIdx < booklets.length; bIdx++) {
      const booklet = booklets[bIdx];
      statusText = translate("scanning.status.savingBooklet", {
        current: bIdx + 1,
        total: booklets.length,
        pages: booklet.pageRefs.length,
      });
      progress = 50 + Math.round(((bIdx + 1) / Math.max(booklets.length, 1)) * 50);

      // Assemble a new PDF by copying pages from the source documents
      const { PDFDocument: PDFDocClass } = await import("pdf-lib");
      const assembledPdf = await PDFDocClass.create();
      for (const ref of booklet.pageRefs) {
        const copiedPages = await assembledPdf.copyPages(ref.doc, [ref.index]);
        assembledPdf.addPage(copiedPages[0]);
      }
      const scanBuffer = await assembledPdf.save();

      let scanCt: Uint8Array | undefined;
      let scanIv: Uint8Array | undefined;
      if ($sessionStore.sessionKey) {
        const encRes = await encrypt($sessionStore.sessionKey, scanBuffer);
        scanCt = encRes.ciphertext;
        scanIv = encRes.iv;
      }

      const key = get(sessionStore).sessionKey;
      await saveStudentEncrypted(
        {
          pseudonymId: booklet.pseudonymId,
          examId,
          fallbackCode: booklet.fallbackCode,
          studentName: booklet.studentName,
          studentNumber: booklet.studentNumber,
          piiCt: new Uint8Array([0]),
          piiIv: new Uint8Array(12),
        },
        key,
      );

      const subId: string = crypto.randomUUID();
      await saveSubmissionEncrypted(
        {
          id: subId,
          examId,
          pseudonymHash: booklet.pseudonymId,
          scanCt,
          scanIv: scanIv || new Uint8Array(12),
          createdAt: new Date().toISOString(),
        },
        key,
      );

      const omrResults = omrResultsByPseudonym.get(booklet.pseudonymId) ?? [];
      for (const r of omrResults) {
        const failed = r.confidence === "failed";
        await saveScoreEncrypted(
          {
            id: crypto.randomUUID(),
            submissionId: subId,
            exerciseId: r.exerciseId,
            // A failed alignment has no trustworthy score — leave it unset so it hydrates as
            // "ungraded" (grade/+page.svelte) instead of silently contributing a 0.
            score: failed ? undefined : r.score,
            selectedOptions: failed ? [] : r.selectedOptions,
            omrMeta: {
              confidence: r.confidence,
              source: "omr",
              flaggedOptions: r.flaggedOptions.length > 0 ? r.flaggedOptions : undefined,
              original: {
                confidence: r.confidence,
                selectedOptions: failed ? [] : [...r.selectedOptions],
                score: failed ? undefined : r.score,
                flaggedOptions: r.flaggedOptions.length > 0 ? [...r.flaggedOptions] : undefined,
              },
              detections:
                !failed && r.bubbles.length > 0
                  ? {
                      pageIndex: r.pageIndex,
                      bubbles: r.bubbles.map((b) => ({
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
      }

      newlyIngestedCount++;
      scannedCount++;

    }

    await refreshUnmatched();
    await loadScannedSubmissions();
    isProcessing = false;
    statusText = translate("scanning.status.complete", {
      fileCount: files.length,
      pageCount: processedPages,
      bookletCount: newlyIngestedCount,
    });

    if (omrAvailable && omrAlignmentFailures > 0) {
      const missingList = Array.from(omrMissingCorners).join(", ");
      const fiducialDetail =
        omrMinFiducialsFound !== null
          ? translate("scanning.omrBanner.alignmentFiducialDetail", {
              found: omrMinFiducialsFound,
              missing: missingList,
            })
          : "";
      omrBanner = translate("scanning.omrBanner.alignmentFailed", {
        count: omrAlignmentFailures,
        fiducialDetail,
      });
    }
  }

  async function updateFallbackCode(item: UnmatchedSubmission) {
    const code = item.newCode.trim();
    if (!code) return;
    const key = get(sessionStore).sessionKey;
    const students = await studentRepository.getByExamId(examId, key);
    let st = students.find((s) => s.pseudonymId === item.studentId);
    if (!st) {
      const rawSt = await db.students.get(item.studentId);
      if (rawSt) st = await decryptStudent(rawSt, key);
    }
    if (!st) {
      const itemHmac = await ensure64CharHex(item.studentId);
      st = students.find((s) => s.pseudonymId === itemHmac);
    }
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
      const fullSub = await submissionRepository.getById(examId, item.id, key || fallbackKey);
      if (fullSub) {
        scanCt = fullSub.scanCt;
        scanIv = fullSub.scanIv;
      }
    }

    if (!scanCt || !scanIv || (!key && !fallbackKey)) {
      alert(translate("scanning.splitMissingData"));
      return;
    }

    try {
      const activeKey = key || fallbackKey;
      const decryptedBytes = await decrypt(activeKey, scanCt, scanIv, fallbackKey);

      const { PDFDocument } = await import("pdf-lib");
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
      const buf1 = await pdf1.save();

      // PDF 2: pages splitPage - 1 to totalPages - 1
      const pdf2 = await PDFDocument.create();
      const indices2 = Array.from({ length: totalPages - splitPage + 1 }, (_, i) => i + splitPage - 1);
      const copied2 = await pdf2.copyPages(srcPdf, indices2);
      copied2.forEach((p) => pdf2.addPage(p));
      const buf2 = await pdf2.save();

      let enc1Ct: Uint8Array | undefined;
      let enc1Iv: Uint8Array | undefined;
      let enc2Ct: Uint8Array | undefined;
      let enc2Iv: Uint8Array | undefined;

      if (activeKey) {
        const enc1 = await encrypt(activeKey, buf1);
        enc1Ct = enc1.ciphertext;
        enc1Iv = enc1.iv;

        const enc2 = await encrypt(activeKey, buf2);
        enc2Ct = enc2.ciphertext;
        enc2Iv = enc2.iv;
      }

      // Update existing submission with Part 1
      await saveSubmissionEncrypted(
        {
          id: item.id,
          examId,
          pseudonymHash: item.pseudonymHash,
          scanCt: enc1Ct,
          scanIv: enc1Iv || new Uint8Array(12),
          createdAt: item.createdAt,
        },
        activeKey,
      );

      // Create new unmatched student & submission record for Part 2
      const part2PseudoId = crypto.randomUUID();
      const part2Fallback = `UNMATCHED-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

      await saveStudentEncrypted(
        {
          pseudonymId: part2PseudoId,
          examId,
          fallbackCode: part2Fallback,
          piiCt: new Uint8Array([0]),
          piiIv: new Uint8Array(12),
        },
        activeKey,
      );

      const part2SubId = crypto.randomUUID();
      await saveSubmissionEncrypted(
        {
          id: part2SubId,
          examId,
          pseudonymHash: part2PseudoId,
          scanCt: enc2Ct,
          scanIv: enc2Iv || new Uint8Array(12),
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

<PageShell width="full">
  <PageHeader title={$t("scanning.pageTitle")} helpTopic="scanning" />

  <HardwareProfileCard {hwProfile} inConstrainedMode={monitor?.inConstrainedMode} />

  {#if omrBanner}
    <div class="my-4 rounded-md border border-amber-400 bg-amber-400/10 px-4 py-3 text-sm text-amber-400">
      {omrBanner}
    </div>
  {/if}

  <UploadPanel {isProcessing} {progress} {statusText} onFileUpload={handleFileUpload} />

  <UnmatchedResolver {unmatchedList} onUpdateFallbackCode={updateFallbackCode} />

  <ScannedSubmissionsTable
    {scannedSubmissions}
    {exportingId}
    {isGraded}
    onPreview={openPreview}
    onGoToGrading={(item) => goto(`/exam/${examId}/grade?submissionId=${item.id}`)}
    onExportPdf={handleExportPdf}
    onSplit={handleSplitSubmission}
    onDeleteGrading={handleDeleteGrading}
    onDelete={handleDeleteScan}
    onDeleteAll={handleDeleteAllScans}
  />
</PageShell>

<ScanPreviewModal
  open={previewModalOpen}
  item={previewItem}
  objectUrl={previewObjectUrl}
  isPdf={previewIsPdf}
  loading={previewLoading}
  error={previewError}
  onClose={closePreview}
/>
