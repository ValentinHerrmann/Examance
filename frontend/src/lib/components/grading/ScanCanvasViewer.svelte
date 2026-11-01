<script lang="ts">
  // Scrollable stack of scan + overlay canvases (one pair per page), drawing/erasing, pinch-zoom and two-finger scroll, lazy PDF page rendering and auto-crop; exposes imperative methods via `bind:this`. Highest-risk area (submission switching, redraw timing): guard every await with `loadSeq`.
  import { cssVar } from "#lib/utils/cssVar";
  import { tick, onMount, onDestroy, untrack } from "svelte";
  import { loadPdfjs } from "#lib/pdf/pdfjs";
  import { get } from "svelte/store";
  import type { SubmissionRecord, ExerciseRecord } from "#lib/db/schema";
  import { submissionRepository } from "#lib/repositories/submissionRepository";
  import { sessionStore } from "#lib/stores/session";
  import { gradingStore, type VectorStroke } from "#lib/grading/gradingStore";
  import { recalculateAutoScores } from "#lib/grading/autoScore";
  import { loadLocalMcGroups, openAnnotation, openScan } from "#lib/db/dbEncryption";
  import { buildSubLabelMap } from "#lib/grading/mcGroupLabels";
  import { drawOmrOverlayForPage } from "#lib/grading/omrOverlay";
  import { drawStrokes } from "#lib/grading/strokeRenderer";
  import type { ScoreBoxContext } from "#lib/grading/scoreBoxes";
  import { ScoreBoxLayer } from "#lib/grading/scoreBoxLayer";
  import { isPdfBytes, decodePngBytes, legacyScanCrop, eraseStrokesAt, newStroke } from "./ScanCanvasViewer";
  import { ScanZoom } from "./scanZoom";
  import { translate } from "#lib/i18n";

  interface Props {
    examId: string;
    submission: SubmissionRecord | undefined;
    exercises: ExerciseRecord[];
    onSubmissionHydrated: (fullSub: SubmissionRecord) => void;
    /** Printed score-box layout to fill in (issue #187); null when the exam has none. */
    scoreBoxes?: ScoreBoxContext | null;
  }

  let { examId, submission, exercises, onSubmissionHydrated, scoreBoxes = null }: Props = $props();

  // ExerciseRecord.mcGroupId/subIndex are not populated for exam-linked exercises (the exam-specific placement lives only in ExamExerciseRecord) — load the real group/letter mapping once per exam for the "a) 1/2" sub-exercise sum stamp in drawOmrDetections().
  let subExerciseLetters: Map<string, string> = $state.raw(new Map());
  let loadedGroupsExamId: string | null = null;

  async function loadMcGroupLetters(id: string) {
    subExerciseLetters = buildSubLabelMap(await loadLocalMcGroups(id).catch(() => []));
  }

  // One scan + overlay canvas pair per page, stacked in a single scroll pane (like the read-only PDF previews). Stroke coordinates stay in each page's own canvas pixels (pdf.js scale 2), so annotations saved by the old one-page-at-a-time viewer line up unchanged.
  interface PageSize {
    w: number;
    h: number;
  }

  const PDF_RENDER_SCALE = 2;
  const VIEWPORT_PADDING = 8; // `p-2` on the scroll pane

  let canvasViewport: HTMLDivElement | undefined = $state();
  let pageSizes: PageSize[] = $state.raw([]);
  // Bumped per load so the `{#key}` block recreates every canvas (a reused canvas with identical width/height attributes would keep the previous student's pixels).
  let docKey = $state(0);
  let pageEls: HTMLDivElement[] = $state([]);
  let scanCanvases: HTMLCanvasElement[] = $state([]);
  let overlayCanvases: HTMLCanvasElement[] = $state([]);

  let isDrawing = false;
  let isErasing = false;
  let gesturePage = 1;
  // Index of the stroke the first finger created and when, so a second finger arriving right after (pinch/two-finger scroll) can take back the accidental dot or stamp.
  let gestureStrokeIndex: number | null = null;
  let gestureStartedAt = 0;

  let activePointers = new Map<number, { x: number; y: number }>();

  // Writable $derived (not proxied): strokes stay the store's own array, which handlePointerMove mutates in place before persistStrokes().
  let strokes: VectorStroke[] = $derived($gradingStore.currentStrokes);

  let loadedSubId: string | null = null;
  let loadSeq = 0;

  // Local PDF state (not needed by any other component, unlike currentPage/totalPages/isScanPdf which live in the store for ZoomPageControls to read).
  let pdfDoc: any = null;
  let renderedPages = new Set<number>();
  let pageObserver: IntersectionObserver | null = null;

  const zoom = new ScanZoom({
    viewport: () => canvasViewport,
    pageSize: (page) => pageSizes[page - 1],
    pageEl: (page) => pageEls[page - 1],
    pageTop,
    padding: VIEWPORT_PADDING,
  });
  const scoreLayer = new ScoreBoxLayer((page) => scanCanvases[page - 1], (page) => redrawOverlay(page));
  onDestroy(() => scoreLayer.destroy());

  function persistStrokes(next: VectorStroke[]) {
    strokes = next;
    gradingStore.setCurrentStrokes(next);
  }

  function recalcScores() {
    const state = get(gradingStore);
    const next = recalculateAutoScores(exercises, strokes, state.scoreInputs, state.manualOverride, state.partInputs);
    gradingStore.setPartInputs(next.partInputs);
    gradingStore.setScoreInputs(next.scoreInputs);
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
    scoreLayer.newDocument(0);
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

  function applyAnnotations(annBytes: Uint8Array | null, subId: string) {
    gradingStore.setStrokesSubmissionId(subId);
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
    return openAnnotation(sub.id, sub.annotationCt, sub.annotationIv, $sessionStore.sessionKey, $sessionStore.fallbackSessionKey);
  }

  async function loadSubmissionCanvas(sub: SubmissionRecord) {
    const seq = ++loadSeq;
    await tick();
    if (!canvasViewport) return;

    // Reset PDF state
    void pdfDoc?.loadingTask?.destroy();
    pdfDoc = null;
    gradingStore.setPdfPaging(1, 1, false);
    gradingStore.setStrokesSubmissionId(null);
    // Replace the previous student's pages at once: they stayed visible next to the new student's scores until the new scan had decrypted and rendered.
    await showMessage(translate("grading.canvas.loading"), cssVar("--color-muted", "#64748b"), 240);
    if (seq !== loadSeq) return;

    const key = get(sessionStore).sessionKey;
    if ((!sub.scanCt || !sub.scanIv || !sub.annotationCt) && key) {
      try {
        const fullSub = await submissionRepository.getById(examId, sub.id, key);
        if (seq !== loadSeq) return;
        if (fullSub && fullSub.scanCt && fullSub.scanIv) {
          sub = fullSub;
          onSubmissionHydrated(fullSub);
        }
      } catch (err) {
        console.error("Failed to load scan for grading:", err);
        if (seq !== loadSeq) return;
        // Without the scan bytes this is a failure, not "scan missing"; with them the record at hand is complete.
        if (!sub.scanCt || !sub.scanIv) {
          await showMessage(translate("grading.canvas.scanLoadFailed"), cssVar("--color-danger-fg", "#a61b29"), 80);
          return;
        }
      }
    }

    if (!sub.scanCt || !sub.scanIv || !$sessionStore.sessionKey) {
      await showMessage(translate("grading.canvas.scanMissing"), cssVar("--color-muted", "#64748b"), 150);
      return;
    }

    try {
      const decryptedBytes = await openScan(sub.id, sub.scanCt, sub.scanIv, $sessionStore.sessionKey, $sessionStore.fallbackSessionKey);
      if (seq !== loadSeq) return;

      // Detect format: PDF or PNG
      const isPdf = isPdfBytes(decryptedBytes);

      if (isPdf) {
        // PDF path: measure every page up front so the stack has its final height, then render pages lazily as they scroll near the viewport.
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
        scoreLayer.newDocument(doc.numPages);
        fitToPage();
        observePages();

        const annBytes = await decryptAnnotations(sub);
        if (seq !== loadSeq) return;
        applyAnnotations(annBytes, sub.id);
      } else {
        // PNG/image path (legacy submissions)
        gradingStore.setPdfPaging(1, 1, false);

        const img = await decodePngBytes(decryptedBytes);
        if (seq !== loadSeq) return;

        const crop = legacyScanCrop(img, get(gradingStore).isAutoCropEnabled);

        await setPages([{ w: crop.w, h: crop.h }]);
        if (seq !== loadSeq || !scanCanvases[0]) return;
        scanCanvases[0].getContext("2d")!.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
        fitToPage();

        const annBytes = await decryptAnnotations(sub);
        if (seq !== loadSeq) return;
        applyAnnotations(annBytes, sub.id);
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
      if (doc === pdfDoc) {
        scoreLayer.markRendered(page);
        redrawOverlay(page);
      }
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
    const remaining = eraseStrokesAt(strokes, page, x, y);
    if (!remaining) return;
    persistStrokes(remaining);
    recalcScores();
    sessionStore.setDirty(true);
    gradingStore.markDirty();
    redrawOverlay(page);
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
      const [a, b] = activePointers.values();
      zoom.pinchStart(a, b);
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
    if (state.drawTool === "eraser") {
      isErasing = true;
      eraseAt(page, x, y);
      return;
    }

    gestureStrokeIndex = strokes.length;
    persistStrokes([...strokes, newStroke(state, exercises, { x, y }, page)]);
    sessionStore.setDirty(true);
    gradingStore.markDirty();
    if (state.drawTool === "pen" || state.drawTool === "line") {
      isDrawing = true;
      return;
    }
    // A stamp is complete on touch.
    recalcScores();
    redrawOverlay(page);
  }

  function handlePointerMove(e: PointerEvent) {
    if (activePointers.has(e.pointerId)) {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Two fingers: pinch to zoom, move to scroll through the pages (one finger draws).
    if (activePointers.size === 2) {
      const [a, b] = activePointers.values();
      if (zoom.pinchMove(a, b)) return;
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
    if (activePointers.size < 2) zoom.pinchEnd();
    isDrawing = false;
    isErasing = false;
  }

  export function zoomIn() {
    zoom.zoomIn();
  }

  export function zoomOut() {
    zoom.zoomOut();
  }

  export function fitToPage() {
    zoom.fitToPage();
  }

  export function resetZoom() {
    zoom.fitToPage();
  }

  onMount(() => {
    const stopResize = zoom.observeResize();
    return () => {
      stopResize();
      pageObserver?.disconnect();
      void pdfDoc?.loadingTask?.destroy();
      pdfDoc = null;
    };
  });

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

    drawStrokes(ctx, strokes, page);
    drawOmrDetections(ctx, overlayCanvas, page);
    scoreLayer.draw(ctx, page, overlayCanvas.width, overlayCanvas.height, exercises, get(gradingStore));
  }

  // Non-persisted OMR draw pass: never pushed into `strokes` (not erasable, no recalcScores()). Shared with the graded-PDF export (routes/exam/[id]/scan) via omrOverlay.ts.
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
    const scores = $gradingStore.scoreInputs;
    if (count > 0 && (mcState || letters || scores)) {
      untrack(() => redrawAllOverlays());
    }
  });

  // The layout loads independently of the scan.
  $effect.pre(() => {
    const ctx = scoreBoxes;
    untrack(() => {
      scoreLayer.setContext(ctx);
      redrawAllOverlays();
    });
  });

  $effect.pre(() => {
    const zoomScale = $gradingStore.zoomScale;
    untrack(() => zoom.zoomChanged(zoomScale));
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
  use:zoom.wheelAction
  onscroll={updateCurrentPageFromScroll}
>
  <!-- No `max-w-full` here: it silently clamped every zoom above 100% instead of letting the viewport scroll, so zooming in did nothing. -->
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
