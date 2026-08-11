<script lang="ts">
  /**
   * Owns the scan canvas + overlay canvas, all pointer-event drawing/erasing
   * logic, pinch-zoom gesture handling, PDF page rendering, and auto-crop.
   * Reads/writes shared grading state (strokes, tool, zoom, PDF paging,
   * scores) through gradingStore. Exposes imperative methods (via
   * `bind:this`) for actions that require canvas/PDF context: page nav,
   * zoom, auto-crop toggle, and clearing annotations.
   *
   * This is intentionally the last piece extracted from the original grade
   * page — it is the highest-risk area (submission switching, redraw timing,
   * pinch-zoom) so every function here is a close 1:1 port of the original.
   */
  import { tick } from "svelte";
  import { get } from "svelte/store";
  import type { SubmissionRecord, ExerciseRecord } from "$lib/db/schema";
  import { submissionRepository } from "$lib/repositories/submissionRepository";
  import { sessionStore } from "$lib/stores/session";
  import { decrypt } from "$lib/crypto/aesGcm";
  import { gradingStore, type VectorStroke } from "$lib/grading/gradingStore";
  import { recalculateAutoScores } from "$lib/grading/autoScore";
  import { loadLocalMcGroups } from "$lib/db/dbEncryption";
  import { drawMissingSymbol, drawCheckmark, drawOmrOverlayForPage } from "$lib/grading/omrOverlay";
  import { getAutoCropBounds } from "./ScanCanvasViewer";

  export let examId: string;
  export let submission: SubmissionRecord | undefined;
  export let exercises: ExerciseRecord[];
  export let onSubmissionHydrated: (fullSub: SubmissionRecord) => void;

  // ExerciseRecord.mcGroupId/subIndex are not populated for exam-linked exercises (the
  // exam-specific placement lives only in ExamExerciseRecord) — load the real group/letter
  // mapping once per exam for the "a) 1/2" sub-exercise sum stamp in drawOmrDetections().
  let subExerciseLetters: Map<string, string> = new Map();
  let loadedGroupsExamId: string | null = null;
  $: if (examId && examId !== loadedGroupsExamId) {
    loadedGroupsExamId = examId;
    loadMcGroupLetters(examId);
  }

  async function loadMcGroupLetters(id: string) {
    const groups = await loadLocalMcGroups(id).catch(() => []);
    const next = new Map<string, string>();
    for (const group of groups) {
      group.memberIds.forEach((exerciseId, idx) => {
        next.set(exerciseId, String.fromCharCode(97 + idx));
      });
    }
    subExerciseLetters = next;
  }

  let scanCanvas: HTMLCanvasElement;
  let overlayCanvas: HTMLCanvasElement;
  let canvasViewport: HTMLDivElement;

  let isDrawing = false;
  let isErasing = false;

  let activePointers = new Map<number, { x: number; y: number }>();
  let initialPinchDistance: number | null = null;
  let initialZoomScale: number = 1.0;

  let strokes: VectorStroke[] = [];
  $: strokes = $gradingStore.currentStrokes;

  // Redraw when OMR detections change (submission switch, or a manual toggle in
  // McAnswerReview carrying `detections` forward) — mirrors how `strokes` above tracks the
  // store, but this pass is a fully separate (non-persisted, non-erasable) overlay so it
  // can't just reuse the stroke-edit call sites.
  $: if (overlayCanvas && ($gradingStore.mcState || subExerciseLetters)) {
    redrawOverlay();
  }

  let loadedSubId: string | null = null;

  // PDF page navigation state (local — mirrors pdfDoc/pdfBytes which are not
  // needed by any other component, unlike currentPage/totalPages/isScanPdf
  // which live in the store for ZoomPageControls to read).
  let pdfDoc: any = null;
  let pdfBytes: Uint8Array | null = null;

  $: if (submission && submission.id !== loadedSubId) {
    loadedSubId = submission.id;
    loadSubmissionCanvas(submission);
  }

  function persistStrokes(next: VectorStroke[]) {
    strokes = next;
    gradingStore.setCurrentStrokes(next);
  }

  function recalcScores() {
    const state = get(gradingStore);
    const next = recalculateAutoScores(exercises, strokes, state.scoreInputs, state.manualOverride);
    gradingStore.setScoreInputs(next);
  }

  export function toggleAutoCrop() {
    gradingStore.setAutoCropEnabled(!get(gradingStore).isAutoCropEnabled);
    if (submission) {
      loadSubmissionCanvas(submission);
    }
  }

  export async function clearAnnotations() {
    persistStrokes([]);
    recalcScores();
    redrawOverlay();
    sessionStore.setDirty(true);
  }

  async function loadSubmissionCanvas(sub: SubmissionRecord) {
    await tick();
    if (!scanCanvas || !overlayCanvas) return;

    const ctx = scanCanvas.getContext("2d")!;
    const overlayCtx = overlayCanvas.getContext("2d")!;

    ctx.clearRect(0, 0, scanCanvas.width, scanCanvas.height);
    overlayCtx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    // Reset PDF state
    pdfDoc = null;
    pdfBytes = null;
    gradingStore.setPdfPaging(1, 1, false);

    const key = get(sessionStore).sessionKey;
    if ((!sub.scanCt || !sub.scanIv || !sub.annotationCt) && key) {
      const fullSub = await submissionRepository.getById(examId, sub.id, key);
      if (fullSub && fullSub.scanCt && fullSub.scanIv) {
        sub = fullSub;
        onSubmissionHydrated(fullSub);
      }
    }

    if (!sub.scanCt || !sub.scanIv || !$sessionStore.sessionKey) {
      // Render fallback blank canvas
      scanCanvas.width = 600;
      scanCanvas.height = 800;
      overlayCanvas.width = 600;
      overlayCanvas.height = 800;
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(0, 0, 600, 800);
      ctx.fillStyle = "#94a3b8";
      ctx.font = "16px sans-serif";
      ctx.fillText("[ Scan Image Missing / Unencrypted ]", 150, 400);
      return;
    }

    try {
      // Decrypt in-memory
      const decryptedBytes = await decrypt(
        $sessionStore.sessionKey,
        sub.scanCt,
        sub.scanIv,
        $sessionStore.fallbackSessionKey
      );

      // Detect format: PDF or PNG
      const isPdf =
        decryptedBytes.length > 4 &&
        decryptedBytes[0] === 0x25 &&
        decryptedBytes[1] === 0x50 &&
        decryptedBytes[2] === 0x44 &&
        decryptedBytes[3] === 0x46;

      if (isPdf) {
        // PDF path: load with pdf.js and render current page
        pdfBytes = decryptedBytes;

        const pdfjsLib = await import("pdfjs-dist");
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
        }

        pdfDoc = await pdfjsLib.getDocument({ data: decryptedBytes }).promise;
        gradingStore.setPdfPaging(1, pdfDoc.numPages, true);

        await renderCurrentPage();

        // Load annotations
        if (sub.annotationCt && sub.annotationIv && $sessionStore.sessionKey) {
          const annBytes = await decrypt(
            $sessionStore.sessionKey,
            sub.annotationCt,
            sub.annotationIv,
            $sessionStore.fallbackSessionKey
          );
          const jsonStr = new TextDecoder().decode(annBytes);
          persistStrokes(JSON.parse(jsonStr));
          redrawOverlay();
          if (strokes.some((s) => s.tool !== "pen" && s.tool !== "line" && s.tool !== "eraser")) {
            recalcScores();
          }
        } else {
          persistStrokes([]);
          redrawOverlay();
        }
      } else {
        // PNG/image path (legacy submissions)
        gradingStore.setPdfPaging(1, 1, false);

        const blob = new Blob([decryptedBytes.buffer as ArrayBuffer], { type: "image/png" });
        const url = URL.createObjectURL(blob);

        const img = new Image();
        img.onload = () => {
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = img.width;
          tempCanvas.height = img.height;
          const tempCtx = tempCanvas.getContext("2d")!;
          tempCtx.drawImage(img, 0, 0);

          let crop = { x: 0, y: 0, w: img.width, h: img.height };
          if (get(gradingStore).isAutoCropEnabled) {
            crop = getAutoCropBounds(tempCtx, img.width, img.height);
          }

          scanCanvas.width = crop.w;
          scanCanvas.height = crop.h;
          overlayCanvas.width = crop.w;
          overlayCanvas.height = crop.h;

          ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
          URL.revokeObjectURL(url);
          tick().then(() => fitToPage());

          // Load annotations
          if (sub.annotationCt && sub.annotationIv && $sessionStore.sessionKey) {
            decrypt(
              $sessionStore.sessionKey,
              sub.annotationCt,
              sub.annotationIv,
              $sessionStore.fallbackSessionKey
            ).then((annBytes) => {
              const jsonStr = new TextDecoder().decode(annBytes);
              persistStrokes(JSON.parse(jsonStr));
              redrawOverlay();
              if (strokes.some((s) => s.tool !== "pen" && s.tool !== "line" && s.tool !== "eraser")) {
                recalcScores();
              }
            });
          } else {
            persistStrokes([]);
            redrawOverlay();
          }
        };
        img.src = url;
      }
    } catch (err) {
      console.error("Failed to decrypt scan for grading:", err);
      if (scanCanvas && overlayCanvas) {
        scanCanvas.width = 600;
        scanCanvas.height = 800;
        overlayCanvas.width = 600;
        overlayCanvas.height = 800;
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(0, 0, 600, 800);
        ctx.fillStyle = "#ef4444";
        ctx.font = "16px sans-serif";
        ctx.fillText("[ Scan Decryption Failed — Key Mismatch or Data Corrupted ]", 80, 400);
      }
    }
  }

  async function renderCurrentPage() {
    if (!pdfDoc || !scanCanvas || !overlayCanvas) return;
    const ctx = scanCanvas.getContext("2d")!;
    const currentPage = get(gradingStore).currentPage;
    const pdfPage = await pdfDoc.getPage(currentPage);
    const viewport = pdfPage.getViewport({ scale: 2 });

    scanCanvas.width = viewport.width;
    scanCanvas.height = viewport.height;
    overlayCanvas.width = viewport.width;
    overlayCanvas.height = viewport.height;

    await pdfPage.render({ canvasContext: ctx, canvas: scanCanvas, viewport } as any).promise;
    tick().then(() => fitToPage());
    redrawOverlay();
  }

  export function goPagePrev() {
    const state = get(gradingStore);
    if (state.currentPage > 1) {
      isDrawing = false;
      isErasing = false;
      gradingStore.setCurrentPage(state.currentPage - 1);
      renderCurrentPage();
    }
  }

  export function goPageNext() {
    const state = get(gradingStore);
    if (state.currentPage < state.totalPages) {
      isDrawing = false;
      isErasing = false;
      gradingStore.setCurrentPage(state.currentPage + 1);
      renderCurrentPage();
    }
  }

  function eraseAt(x: number, y: number) {
    const radius = 25;
    const remainingStrokes: VectorStroke[] = [];
    let erasedAny = false;
    const currentPage = get(gradingStore).currentPage;

    for (const stroke of strokes) {
      const strokePage = stroke.pageNumber ?? 1;
      if (strokePage === currentPage) {
        const isHit = stroke.points.some(
          (p) => Math.hypot(p.x - x, p.y - y) <= radius
        );
        if (isHit) {
          erasedAny = true;
        } else {
          remainingStrokes.push(stroke);
        }
      } else {
        remainingStrokes.push(stroke);
      }
    }

    if (erasedAny) {
      persistStrokes(remainingStrokes);
      recalcScores();
      sessionStore.setDirty(true);
      redrawOverlay();
    }
  }

  function handlePointerDown(e: PointerEvent) {
    if (!overlayCanvas) return;
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2) {
      isDrawing = false;
      isErasing = false;
      const pts = Array.from(activePointers.values());
      initialPinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      initialZoomScale = get(gradingStore).zoomScale;
      return;
    }

    if (activePointers.size > 2) return;

    const rect = overlayCanvas.getBoundingClientRect();
    const scaleX = overlayCanvas.width / rect.width;
    const scaleY = overlayCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const state = get(gradingStore);
    const drawTool = state.drawTool;
    const currentPage = state.currentPage;
    const activeExerciseId = state.activeExerciseId;

    if (drawTool === "eraser") {
      isErasing = true;
      eraseAt(x, y);
      return;
    }

    if (drawTool === "line") {
      isDrawing = true;
      persistStrokes([
        ...strokes,
        {
          tool: "line",
          points: [{ x, y }, { x, y }],
          color: state.penColor,
          exerciseId: activeExerciseId || (exercises[0] ? exercises[0].id : undefined),
          pageNumber: currentPage,
        },
      ]);
      sessionStore.setDirty(true);
      return;
    }

    const isStamp = drawTool !== "pen";
    if (isStamp) {
      const color = "#ef4444";
      const targetEx = exercises.find((ex) => ex.id === activeExerciseId) || exercises[0];
      persistStrokes([
        ...strokes,
        {
          tool: drawTool,
          points: [{ x, y }],
          color,
          exerciseId: targetEx ? targetEx.id : undefined,
          pageNumber: currentPage,
        },
      ]);

      recalcScores();
      sessionStore.setDirty(true);
      redrawOverlay();
      return;
    }

    isDrawing = true;
    persistStrokes([
      ...strokes,
      {
        tool: "pen",
        points: [{ x, y }],
        color: state.penColor,
        exerciseId: activeExerciseId || (exercises[0] ? exercises[0].id : undefined),
        pageNumber: currentPage,
      },
    ]);
    sessionStore.setDirty(true);
  }

  function handlePointerMove(e: PointerEvent) {
    if (!overlayCanvas) return;
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (activePointers.size === 2 && initialPinchDistance !== null) {
      const pts = Array.from(activePointers.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (initialPinchDistance > 0) {
        const factor = currentDist / initialPinchDistance;
        gradingStore.setZoomScale(
          Math.min(4.0, Math.max(0.5, Math.round(initialZoomScale * factor * 100) / 100))
        );
      }
      return;
    }

    if (!isDrawing && !isErasing) return;

    const rect = overlayCanvas.getBoundingClientRect();
    const scaleX = overlayCanvas.width / rect.width;
    const scaleY = overlayCanvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const drawTool = get(gradingStore).drawTool;

    if (isErasing && drawTool === "eraser") {
      eraseAt(x, y);
      return;
    }

    if (!isDrawing) return;
    const currentStroke = strokes[strokes.length - 1];
    if (currentStroke) {
      if (currentStroke.tool === "line") {
        currentStroke.points[1] = { x, y };
      } else if (currentStroke.tool === "pen") {
        currentStroke.points.push({ x, y });
      }
      persistStrokes(strokes);
      redrawOverlay();
    }
  }

  function handlePointerUp(e?: PointerEvent) {
    if (e && e.pointerId !== undefined) {
      activePointers.delete(e.pointerId);
    } else {
      activePointers.clear();
    }
    if (activePointers.size < 2) {
      initialPinchDistance = null;
    }
    isDrawing = false;
    isErasing = false;
  }

  function handleWheel(e: WheelEvent) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.25 : -0.25;
      const zoomScale = get(gradingStore).zoomScale;
      gradingStore.setZoomScale(Math.min(4.0, Math.max(0.5, Math.round((zoomScale + delta) * 100) / 100)));
    }
  }

  export function zoomIn() {
    const zoomScale = get(gradingStore).zoomScale;
    gradingStore.setZoomScale(Math.min(4.0, Math.round((zoomScale + 0.25) * 100) / 100));
  }

  export function zoomOut() {
    const zoomScale = get(gradingStore).zoomScale;
    gradingStore.setZoomScale(Math.max(0.5, Math.round((zoomScale - 0.25) * 100) / 100));
  }

  export function fitToPage() {
    if (!canvasViewport || !scanCanvas || scanCanvas.width === 0 || scanCanvas.height === 0) {
      gradingStore.setZoomScale(1.0);
      return;
    }
    const availWidth = canvasViewport.clientWidth - 16;
    const availHeight = canvasViewport.clientHeight - 16;
    if (availWidth <= 0 || availHeight <= 0) {
      gradingStore.setZoomScale(1.0);
      return;
    }
    const scaleX = availWidth / scanCanvas.width;
    const scaleY = availHeight / scanCanvas.height;
    const idealScale = Math.min(scaleX, scaleY);
    const scaleIfWidth100 = availWidth / scanCanvas.width;
    const ratio = idealScale / scaleIfWidth100;
    gradingStore.setZoomScale(Math.min(4.0, Math.max(0.1, Math.round(ratio * 100) / 100)));
  }

  export function resetZoom() {
    fitToPage();
  }

  function redrawOverlay() {
    if (!overlayCanvas) return;
    const ctx = overlayCanvas.getContext("2d")!;
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    const currentPage = get(gradingStore).currentPage;
    const visibleStrokes = strokes.filter(
      (stroke) => (stroke.pageNumber ?? 1) === currentPage
    );

    for (const stroke of visibleStrokes) {
      ctx.strokeStyle = "#ef4444";
      ctx.fillStyle = "#ef4444";
      ctx.lineWidth = 4;
      ctx.lineCap = "round";

      if (stroke.tool === "pen") {
        ctx.beginPath();
        stroke.points.forEach((p, idx) => {
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
        drawCheckmark(ctx, p.x, p.y);
      } else if (stroke.tool === "check_half") {
        const p = stroke.points[0];
        drawCheckmark(ctx, p.x, p.y);
        // 1 crossing line
        ctx.beginPath();
        ctx.moveTo(p.x + 1, p.y - 12);
        ctx.lineTo(p.x + 11, p.y - 2);
        ctx.stroke();
      } else if (stroke.tool === "check_quarter") {
        const p = stroke.points[0];
        drawCheckmark(ctx, p.x, p.y);
        // 2 crossing lines
        ctx.beginPath();
        ctx.moveTo(p.x - 2, p.y - 13);
        ctx.lineTo(p.x + 8, p.y - 3);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x + 5, p.y - 13);
        ctx.lineTo(p.x + 15, p.y - 3);
        ctx.stroke();
      } else if (stroke.tool === "minus_full") {
        const p = stroke.points[0];
        ctx.font = "bold 26px sans-serif";
        ctx.fillText("-1BE", p.x, p.y);
      } else if (stroke.tool === "minus_half") {
        const p = stroke.points[0];
        ctx.font = "bold 26px sans-serif";
        ctx.fillText("-0,5BE", p.x, p.y);
      } else if (stroke.tool === "minus_quarter") {
        const p = stroke.points[0];
        ctx.font = "bold 26px sans-serif";
        ctx.fillText("-0,25BE", p.x, p.y);
      } else if (stroke.tool === "wrong" || stroke.tool === "cross") {
        const p = stroke.points[0];
        ctx.font = "bold italic 30px serif";
        ctx.fillText("f", p.x, p.y);
      } else if (stroke.tool === "missing") {
        drawMissingSymbol(ctx, stroke.points[0].x, stroke.points[0].y);
      } else if (stroke.tool === "wf") {
        const p = stroke.points[0];
        ctx.font = "bold 24px sans-serif";
        ctx.fillText("WF", p.x, p.y);
      } else if (stroke.tool === "ff") {
        const p = stroke.points[0];
        ctx.font = "bold 24px sans-serif";
        ctx.fillText("FF", p.x, p.y);
      }
    }

    drawOmrDetections(ctx, currentPage);
  }

  /**
   * Draws OMR-derived annotations (per-option score stamps, missing-option symbols,
   * per-sub-exercise "a) 1/2" totals) over every MC/SC/TF exercise on the currently-displayed
   * page — a separate, non-persisted draw pass appended after the annotation strokes above:
   * never pushed into `strokes`, so it isn't erasable and doesn't feed recalcScores(). Shared
   * with the graded-PDF export (routes/exam/[id]/scan/+page.svelte) via omrOverlay.ts so both
   * render identical annotations.
   */
  function drawOmrDetections(ctx: CanvasRenderingContext2D, currentPage: number) {
    const state = get(gradingStore);
    drawOmrOverlayForPage(
      ctx,
      overlayCanvas.width,
      overlayCanvas.height,
      currentPage,
      state.mcState,
      exercises,
      subExerciseLetters,
      state.scoreInputs
    );
  }
</script>

<div
  class="flex flex-1 min-h-0 w-full h-full items-start justify-center overflow-auto relative box-border bg-[#020617] p-2"
  bind:this={canvasViewport}
  on:wheel={handleWheel}
>
  <div class="relative mx-auto block max-w-full" style="width: {$gradingStore.zoomScale * 100}%;">
    <canvas bind:this={scanCanvas} class="block w-full h-auto rounded shadow-[0_8px_30px_rgba(0,0,0,0.7)]"></canvas>
    <canvas
      bind:this={overlayCanvas}
      class="absolute left-0 top-0 h-full w-full cursor-crosshair"
      on:pointerdown={handlePointerDown}
      on:pointermove={handlePointerMove}
      on:pointerup={handlePointerUp}
      on:pointercancel={handlePointerUp}
    ></canvas>
  </div>
</div>
