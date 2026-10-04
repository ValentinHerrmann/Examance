<script lang="ts">
  // Scrollable stack of scan + overlay canvases (one pair per page), drawing/erasing, pinch-zoom and
  // two-finger scroll, lazy PDF page rendering and auto-crop; exposes imperative methods via
  // `bind:this`. Highest-risk area (submission switching, redraw timing): guard every await with `loadSeq`.
  import { cssVar } from "#lib/utils/cssVar";
  import { tick, onMount, untrack } from "svelte";
  import { loadPdfjs } from "#lib/pdf/pdfjs";
  import { get } from "svelte/store";
  import type { SubmissionRecord, ExerciseRecord } from "#lib/db/schema";
  import { submissionRepository } from "#lib/repositories/submissionRepository";
  import { sessionStore } from "#lib/stores/session";
  import { decrypt } from "#lib/crypto/aesGcm";
  import { gradingStore, type VectorStroke } from "#lib/grading/gradingStore";
  import { recalculateAutoScores } from "#lib/grading/autoScore";
  import { loadLocalMcGroups } from "#lib/db/dbEncryption";
  import { buildSubLabelMap } from "#lib/grading/mcGroupLabels";
  import { drawMissingSymbol, drawCheckmark, drawOmrOverlayForPage } from "#lib/grading/omrOverlay";
  import { getAutoCropBounds } from "./ScanCanvasViewer";
  import { translate } from "#lib/i18n";

  interface Props {
    examId: string;
    submission: SubmissionRecord | undefined;
    exercises: ExerciseRecord[];
    onSubmissionHydrated: (fullSub: SubmissionRecord) => void;
  }

  let { examId, submission, exercises, onSubmissionHydrated }: Props = $props();

  // ExerciseRecord.mcGroupId/subIndex are not populated for exam-linked exercises (the
  // exam-specific placement lives only in ExamExerciseRecord) — load the real group/letter
  // mapping once per exam for the "a) 1/2" sub-exercise sum stamp in drawOmrDetections().
  let subExerciseLetters: Map<string, string> = $state.raw(new Map());
  let loadedGroupsExamId: string | null = null;

  async function loadMcGroupLetters(id: string) {
    subExerciseLetters = buildSubLabelMap(await loadLocalMcGroups(id).catch(() => []));
  }

  // One scan + overlay canvas pair per page, stacked in a single scroll pane (like the read-only
  // PDF previews). Stroke coordinates stay in each page's own canvas pixels (pdf.js scale 2), so
  // annotations saved by the old one-page-at-a-time viewer line up unchanged.
  interface PageSize {
    w: number;
    h: number;
  }

  const PDF_RENDER_SCALE = 2;
  const VIEWPORT_PADDING = 8; // `p-2` on the scroll pane

  let canvasViewport: HTMLDivElement | undefined = $state();
  let pageSizes: PageSize[] = $state.raw([]);
  // Bumped per load so the `{#key}` block recreates every canvas (a reused canvas with
  // identical width/height attributes would keep the previous student's pixels).
  let docKey = $state(0);
  let pageEls: HTMLDivElement[] = $state([]);
  let scanCanvases: HTMLCanvasElement[] = $state([]);
  let overlayCanvases: HTMLCanvasElement[] = $state([]);

  let isDrawing = false;
  let isErasing = false;
  let gesturePage = 1;
  // Index of the stroke the first finger created and when, so a second finger arriving right
  // after (pinch/two-finger scroll) can take back the accidental dot or stamp.
  let gestureStrokeIndex: number | null = null;
  let gestureStartedAt = 0;

  let activePointers = new Map<number, { x: number; y: number }>();
  let initialPinchDistance: number | null = null;
  let initialZoomScale: number = 1.0;
  let lastPinchMid: { x: number; y: number } | null = null;

  // Writable $derived (not proxied): strokes stay the store's own array, which handlePointerMove
  // mutates in place before persistStrokes().
  let strokes: VectorStroke[] = $derived($gradingStore.currentStrokes);

  let loadedSubId: string | null = null;
  let loadSeq = 0;

  // Local PDF state (not needed by any other component, unlike currentPage/totalPages/isScanPdf
  // which live in the store for ZoomPageControls to read).
  let pdfDoc: any = null;
  let renderedPages = new Set<number>();
  let pageObserver: IntersectionObserver | null = null;

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
    redrawAllOverlays();
    sessionStore.setDirty(true);
    gradingStore.markDirty();
  }

  /** Replaces the page stack with `sizes` (fresh canvases) and waits until they are in the DOM. */
  async function setPages(sizes: PageSize[]) {
    pageObserver?.disconnect();
    renderedPages = new Set();
    pageEls = [];
    scanCanvases = [];
    overlayCanvases = [];
    pageSizes = sizes;
    docKey += 1;
    await tick();
    if (canvasViewport) canvasViewport.scrollTop = 0;
  }

  async function showMessage(message: string, color: string, x: number) {
    await setPages([{ w: 600, h: 800 }]);
    const canvas = scanCanvases[0];
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = cssVar("--color-surface-raised", "#ffffff");
    ctx.fillRect(0, 0, 600, 800);
    ctx.fillStyle = color;
    ctx.font = "16px sans-serif";
    ctx.fillText(message, x, 400);
    fitToPage();
  }

  function applyAnnotations(annBytes: Uint8Array | null) {
    if (annBytes) {
      persistStrokes(JSON.parse(new TextDecoder().decode(annBytes)));
      redrawAllOverlays();
      if (strokes.some((s) => s.tool !== "pen" && s.tool !== "line" && s.tool !== "eraser")) {
        recalcScores();
      }
    } else {
      persistStrokes([]);
      redrawAllOverlays();
    }
  }

  async function decryptAnnotations(sub: SubmissionRecord): Promise<Uint8Array | null> {
    if (!sub.annotationCt || !sub.annotationIv || !$sessionStore.sessionKey) return null;
    return decrypt($sessionStore.sessionKey, sub.annotationCt, sub.annotationIv, $sessionStore.fallbackSessionKey);
  }

  async function loadSubmissionCanvas(sub: SubmissionRecord) {
    const seq = ++loadSeq;
    await tick();
    if (!canvasViewport) return;

    // Reset PDF state
    void pdfDoc?.loadingTask?.destroy();
    pdfDoc = null;
    gradingStore.setPdfPaging(1, 1, false);

    const key = get(sessionStore).sessionKey;
    if ((!sub.scanCt || !sub.scanIv || !sub.annotationCt) && key) {
      const fullSub = await submissionRepository.getById(examId, sub.id, key);
      if (seq !== loadSeq) return;
      if (fullSub && fullSub.scanCt && fullSub.scanIv) {
        sub = fullSub;
        onSubmissionHydrated(fullSub);
      }
    }

    if (!sub.scanCt || !sub.scanIv || !$sessionStore.sessionKey) {
      await showMessage(translate("grading.canvas.scanMissing"), cssVar("--color-muted", "#64748b"), 150);
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
      if (seq !== loadSeq) return;

      // Detect format: PDF or PNG
      const isPdf =
        decryptedBytes.length > 4 &&
        decryptedBytes[0] === 0x25 &&
        decryptedBytes[1] === 0x50 &&
        decryptedBytes[2] === 0x44 &&
        decryptedBytes[3] === 0x46;

      if (isPdf) {
        // PDF path: measure every page up front so the stack has its final height, then render
        // pages lazily as they scroll near the viewport.
        const pdfjsLib = await loadPdfjs();
        const doc = await pdfjsLib.getDocument({ data: decryptedBytes }).promise;
        if (seq !== loadSeq) {
          void doc.loadingTask.destroy();
          return;
        }
        const sizes: PageSize[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
          const viewport = (await doc.getPage(i)).getViewport({ scale: PDF_RENDER_SCALE });
          sizes.push({ w: viewport.width, h: viewport.height });
        }
        if (seq !== loadSeq) {
          void doc.loadingTask.destroy();
          return;
        }
        pdfDoc = doc;
        gradingStore.setPdfPaging(1, doc.numPages, true);
        await setPages(sizes);
        fitToPage();
        observePages();

        const annBytes = await decryptAnnotations(sub);
        if (seq !== loadSeq) return;
        applyAnnotations(annBytes);
      } else {
        // PNG/image path (legacy submissions)
        gradingStore.setPdfPaging(1, 1, false);

        const blob = new Blob([decryptedBytes.buffer as ArrayBuffer], { type: "image/png" });
        const url = URL.createObjectURL(blob);
        const img = new Image();
        try {
          img.src = url;
          await img.decode();
        } finally {
          URL.revokeObjectURL(url);
        }
        if (seq !== loadSeq) return;

        let crop = { x: 0, y: 0, w: img.width, h: img.height };
        if (get(gradingStore).isAutoCropEnabled) {
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = img.width;
          tempCanvas.height = img.height;
          const tempCtx = tempCanvas.getContext("2d")!;
          tempCtx.drawImage(img, 0, 0);
          crop = getAutoCropBounds(tempCtx, img.width, img.height);
        }

        await setPages([{ w: crop.w, h: crop.h }]);
        if (seq !== loadSeq || !scanCanvases[0]) return;
        scanCanvases[0].getContext("2d")!.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
        fitToPage();

        const annBytes = await decryptAnnotations(sub);
        if (seq !== loadSeq) return;
        applyAnnotations(annBytes);
      }
    } catch (err) {
      console.error("Failed to decrypt scan for grading:", err);
      if (seq !== loadSeq) return;
      await showMessage(translate("grading.canvas.scanDecryptFailed"), cssVar("--color-danger-fg", "#a61b29"), 80);
    }
  }

  // Renders pages near the viewport (one screen ahead and behind) on first approach.
  function observePages() {
    pageObserver?.disconnect();
    if (!canvasViewport || typeof IntersectionObserver === "undefined") {
      pageEls.forEach((_, i) => renderPage(i + 1));
      return;
    }
    pageObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (page) renderPage(page);
        }
      },
      { root: canvasViewport, rootMargin: "100% 0px" }
    );
    for (const el of pageEls) {
      if (el) pageObserver.observe(el);
    }
  }

  async function renderPage(page: number) {
    const doc = pdfDoc;
    const canvas = scanCanvases[page - 1];
    if (!doc || !canvas || renderedPages.has(page)) return;
    renderedPages.add(page);
    try {
      const pdfPage = await doc.getPage(page);
      if (doc !== pdfDoc) return;
      const viewport = pdfPage.getViewport({ scale: PDF_RENDER_SCALE });
      await pdfPage.render({ canvasContext: canvas.getContext("2d")!, canvas, viewport } as any).promise;
    } catch (err) {
      if (doc === pdfDoc) {
        renderedPages.delete(page);
        console.error(`Failed to render scan page ${page}:`, err);
      }
    }
  }

  function pageTop(page: number): number | null {
    const el = pageEls[page - 1];
    if (!el || !canvasViewport) return null;
    return (
      canvasViewport.scrollTop +
      el.getBoundingClientRect().top -
      canvasViewport.getBoundingClientRect().top -
      VIEWPORT_PADDING
    );
  }

  function scrollToPage(page: number) {
    const top = pageTop(page);
    if (top === null || !canvasViewport) return;
    canvasViewport.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
    gradingStore.setCurrentPage(page);
  }

  // The page indicator follows the page that covers the upper part of the pane.
  function updateCurrentPageFromScroll() {
    if (!canvasViewport || pageSizes.length <= 1) return;
    const probe = canvasViewport.getBoundingClientRect().top + canvasViewport.clientHeight * 0.4;
    let page = 1;
    pageEls.forEach((el, i) => {
      if (el && el.getBoundingClientRect().top <= probe) page = i + 1;
    });
    if (page !== get(gradingStore).currentPage) {
      gradingStore.setCurrentPage(page);
    }
  }

  export function goPagePrev() {
    const state = get(gradingStore);
    if (state.currentPage > 1) {
      isDrawing = false;
      isErasing = false;
      scrollToPage(state.currentPage - 1);
    }
  }

  export function goPageNext() {
    const state = get(gradingStore);
    if (state.currentPage < state.totalPages) {
      isDrawing = false;
      isErasing = false;
      scrollToPage(state.currentPage + 1);
    }
  }

  function eraseAt(page: number, x: number, y: number) {
    const radius = 25;
    const remainingStrokes: VectorStroke[] = [];
    let erasedAny = false;

    for (const stroke of strokes) {
      const strokePage = stroke.pageNumber ?? 1;
      if (strokePage === page) {
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
      gradingStore.markDirty();
      redrawOverlay(page);
    }
  }

  function pageFromEvent(e: PointerEvent): number | null {
    const el = (e.target as Element | null)?.closest?.("[data-page]") as HTMLElement | null;
    const page = Number(el?.dataset.page);
    return page >= 1 && page <= pageSizes.length ? page : null;
  }

  function canvasPoint(e: PointerEvent, page: number): { x: number; y: number } | null {
    const overlay = overlayCanvases[page - 1];
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return {
      x: (e.clientX - rect.left) * (overlay.width / rect.width),
      y: (e.clientY - rect.top) * (overlay.height / rect.height),
    };
  }

  function pinchMidpoint(): { x: number; y: number } {
    const pts = Array.from(activePointers.values());
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }

  function handlePointerDown(e: PointerEvent) {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointers.size === 2) {
      isDrawing = false;
      isErasing = false;
      // The first finger of a two-finger gesture already placed a dot or stamp; take it back.
      if (gestureStrokeIndex !== null && performance.now() - gestureStartedAt < 300 && gestureStrokeIndex < strokes.length) {
        const page = strokes[gestureStrokeIndex].pageNumber ?? 1;
        persistStrokes(strokes.filter((_, i) => i !== gestureStrokeIndex));
        recalcScores();
        redrawOverlay(page);
      }
      gestureStrokeIndex = null;
      const pts = Array.from(activePointers.values());
      initialPinchDistance = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      initialZoomScale = get(gradingStore).zoomScale;
      lastPinchMid = pinchMidpoint();
      return;
    }

    if (activePointers.size > 2) return;

    const page = pageFromEvent(e);
    if (page === null) return;
    const point = canvasPoint(e, page);
    if (!point) return;
    const { x, y } = point;
    gesturePage = page;
    gestureStrokeIndex = null;
    gestureStartedAt = performance.now();

    const state = get(gradingStore);
    const drawTool = state.drawTool;
    const activeExerciseId = state.activeExerciseId;

    if (drawTool === "eraser") {
      isErasing = true;
      eraseAt(page, x, y);
      return;
    }

    if (drawTool === "line") {
      isDrawing = true;
      gestureStrokeIndex = strokes.length;
      persistStrokes([
        ...strokes,
        {
          tool: "line",
          points: [{ x, y }, { x, y }],
          color: state.penColor,
          exerciseId: activeExerciseId || (exercises[0] ? exercises[0].id : undefined),
          pageNumber: page,
        },
      ]);
      sessionStore.setDirty(true);
      gradingStore.markDirty();
      return;
    }

    const isStamp = drawTool !== "pen";
    if (isStamp) {
      const color = "#ef4444";
      const targetEx = exercises.find((ex) => ex.id === activeExerciseId) || exercises[0];
      gestureStrokeIndex = strokes.length;
      persistStrokes([
        ...strokes,
        {
          tool: drawTool,
          points: [{ x, y }],
          color,
          exerciseId: targetEx ? targetEx.id : undefined,
          pageNumber: page,
        },
      ]);

      recalcScores();
      sessionStore.setDirty(true);
      gradingStore.markDirty();
      redrawOverlay(page);
      return;
    }

    isDrawing = true;
    gestureStrokeIndex = strokes.length;
    persistStrokes([
      ...strokes,
      {
        tool: "pen",
        points: [{ x, y }],
        color: state.penColor,
        exerciseId: activeExerciseId || (exercises[0] ? exercises[0].id : undefined),
        pageNumber: page,
      },
    ]);
    sessionStore.setDirty(true);
    gradingStore.markDirty();
  }

  function handlePointerMove(e: PointerEvent) {
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Two fingers: pinch to zoom, move to scroll through the pages (one finger draws).
    if (activePointers.size === 2 && initialPinchDistance !== null) {
      const pts = Array.from(activePointers.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (initialPinchDistance > 0) {
        const factor = currentDist / initialPinchDistance;
        gradingStore.setZoomScale(
          Math.min(4.0, Math.max(0.5, Math.round(initialZoomScale * factor * 100) / 100))
        );
      }
      const mid = pinchMidpoint();
      if (lastPinchMid && canvasViewport) {
        canvasViewport.scrollBy({ left: lastPinchMid.x - mid.x, top: lastPinchMid.y - mid.y });
      }
      lastPinchMid = mid;
      return;
    }

    if (!isDrawing && !isErasing) return;

    const point = canvasPoint(e, gesturePage);
    if (!point) return;
    const { x, y } = point;

    const drawTool = get(gradingStore).drawTool;

    if (isErasing && drawTool === "eraser") {
      eraseAt(gesturePage, x, y);
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
      redrawOverlay(gesturePage);
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
      lastPinchMid = null;
    }
    isDrawing = false;
    isErasing = false;
  }

  // Svelte 5 registers `onwheel` as passive; ctrl+wheel zoom needs preventDefault, so attach non-passively.
  // A plain wheel scrolls the page stack natively.
  function wheelAction(node: HTMLElement) {
    node.addEventListener("wheel", handleWheel, { passive: false });
    return { destroy: () => node.removeEventListener("wheel", handleWheel) };
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

  /** Zoom so the current page fits the pane; the other pages are a scroll away. */
  export function fitToPage() {
    const size = pageSizes[get(gradingStore).currentPage - 1] ?? pageSizes[0];
    if (!canvasViewport || !size || size.w === 0 || size.h === 0) {
      gradingStore.setZoomScale(1.0);
      return;
    }
    const availWidth = canvasViewport.clientWidth - 2 * VIEWPORT_PADDING;
    const availHeight = canvasViewport.clientHeight - 2 * VIEWPORT_PADDING;
    if (availWidth <= 0 || availHeight <= 0) {
      gradingStore.setZoomScale(1.0);
      return;
    }
    const scaleX = availWidth / size.w;
    const scaleY = availHeight / size.h;
    const idealScale = Math.min(scaleX, scaleY);
    const ratio = idealScale / scaleX;
    gradingStore.setZoomScale(Math.min(4.0, Math.max(0.1, Math.round(ratio * 100) / 100)));
  }

  export function resetZoom() {
    fitToPage();
  }

  /* Re-fit when the pane changes size — rotating a tablet or opening the score
   * sheet used to leave the scan at a zoom computed for the old width. */
  onMount(() => {
    if (!canvasViewport || typeof ResizeObserver === "undefined") {
      return () => pageObserver?.disconnect();
    }

    let lastWidth = canvasViewport.clientWidth;
    const observer = new ResizeObserver(() => {
      const width = canvasViewport!.clientWidth;
      // Ignore sub-pixel jitter and height-only changes.
      if (Math.abs(width - lastWidth) < 24) {
        return;
      }
      lastWidth = width;
      fitToPage();
    });
    observer.observe(canvasViewport);
    return () => {
      observer.disconnect();
      pageObserver?.disconnect();
      void pdfDoc?.loadingTask?.destroy();
      pdfDoc = null;
    };
  });

  // Zooming resizes every page above the viewport; keep the same spot of the current page in view.
  let lastZoomScale: number | null = null;
  function keepScrollAnchorAcrossZoom() {
    if (!canvasViewport || pageSizes.length === 0) return;
    const page = get(gradingStore).currentPage;
    const el = pageEls[page - 1];
    const top = pageTop(page);
    if (!el || top === null || el.offsetHeight === 0) return;
    const fraction = (canvasViewport.scrollTop - top) / el.offsetHeight;
    tick().then(() => {
      const newTop = pageTop(page);
      if (!canvasViewport || newTop === null) return;
      canvasViewport.scrollTop = newTop + fraction * el.offsetHeight;
    });
  }

  function redrawAllOverlays() {
    for (let page = 1; page <= pageSizes.length; page++) {
      redrawOverlay(page);
    }
  }

  function redrawOverlay(page: number) {
    const overlayCanvas = overlayCanvases[page - 1];
    if (!overlayCanvas) return;
    const ctx = overlayCanvas.getContext("2d")!;
    ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);

    const visibleStrokes = strokes.filter(
      (stroke) => (stroke.pageNumber ?? 1) === page
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

    drawOmrDetections(ctx, overlayCanvas, page);
  }

  // Non-persisted OMR draw pass: never pushed into `strokes` (not erasable, no recalcScores()).
  // Shared with the graded-PDF export (routes/exam/[id]/scan) via omrOverlay.ts.
  function drawOmrDetections(ctx: CanvasRenderingContext2D, overlayCanvas: HTMLCanvasElement, page: number) {
    const state = get(gradingStore);
    drawOmrOverlayForPage(
      ctx,
      overlayCanvas.width,
      overlayCanvas.height,
      page,
      state.mcState,
      exercises,
      subExerciseLetters,
      state.scoreInputs
    );
  }

  $effect.pre(() => {
    const id = examId;
    if (id && id !== loadedGroupsExamId) {
      loadedGroupsExamId = id;
      untrack(() => loadMcGroupLetters(id));
    }
  });

  // Redraw the separate, non-persisted OMR overlay when detections or group letters change.
  $effect.pre(() => {
    const count = overlayCanvases.length;
    const mcState = $gradingStore.mcState;
    const letters = subExerciseLetters;
    if (count > 0 && (mcState || letters)) {
      untrack(() => redrawAllOverlays());
    }
  });

  $effect.pre(() => {
    const zoom = $gradingStore.zoomScale;
    untrack(() => {
      if (lastZoomScale !== null && lastZoomScale !== zoom) keepScrollAnchorAcrossZoom();
      lastZoomScale = zoom;
    });
  });

  $effect.pre(() => {
    const sub = submission;
    if (sub && sub.id !== loadedSubId) {
      loadedSubId = sub.id;
      untrack(() => loadSubmissionCanvas(sub));
    }
  });
</script>

<div
  class="scroll-pane relative box-border h-full min-h-0 w-full flex-1 overflow-auto overscroll-contain bg-surface-viewer p-2"
  bind:this={canvasViewport}
  use:wheelAction
  onscroll={updateCurrentPageFromScroll}
>
  <!-- No `max-w-full` here: it silently clamped every zoom above 100% instead
       of letting the viewport scroll, so zooming in did nothing. -->
  <div
    class="relative mx-auto flex flex-col gap-2"
    style="width: {$gradingStore.zoomScale * 100}%;"
    role="presentation"
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointercancel={handlePointerUp}
  >
    {#key docKey}
      {#each pageSizes as size, i (i)}
        <div bind:this={pageEls[i]} class="relative" data-page={i + 1}>
          <canvas
            bind:this={scanCanvases[i]}
            width={size.w}
            height={size.h}
            class="block h-auto w-full rounded-sm bg-surface-raised shadow-md"
          ></canvas>
          <canvas
            bind:this={overlayCanvases[i]}
            width={size.w}
            height={size.h}
            class="absolute top-0 left-0 h-full w-full cursor-crosshair touch-none"
          ></canvas>
        </div>
      {/each}
    {/key}
  </div>
</div>
