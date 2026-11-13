<script lang="ts">
  // Scrollable stack of scan + overlay canvases (one pair per page), drawing/erasing, pinch-zoom and finger scroll, lazy PDF page rendering and auto-crop; exposes imperative methods via `bind:this`. Highest-risk area (submission switching, redraw timing): guard every await with `loadSeq`. Pointer routing (pen vs. finger, issue #233) lives in `pointerInput.ts`.
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
  import { drawPenSegment, drawStrokes } from "#lib/grading/strokeRenderer";
  import type { ScoreBoxContext } from "#lib/grading/scoreBoxes";
  import { ScoreBoxLayer } from "#lib/grading/scoreBoxLayer";
  import { isPdfBytes, decodePngBytes, legacyScanCrop } from "./ScanCanvasViewer";
  import { ScanZoom } from "./scanZoom";
  import { StrokeInput } from "./strokeInput";
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

  // Points of the live stroke `liveDrawnFor` already on its canvas (drawn segment by segment).
  let liveDrawn = 0;
  let liveDrawnFor: VectorStroke | null = null;

  // Writable $derived (not proxied): strokes stay the store's own array; persistStrokes() replaces it.
  let strokes: VectorStroke[] = $derived($gradingStore.currentStrokes);
  // Own deriveds so the OMR redraw effect reruns only when these change, not on every store update.
  let mcStateNow = $derived($gradingStore.mcState);
  let scoreInputsNow = $derived($gradingStore.scoreInputs);
  let zoomScaleNow = $derived($gradingStore.zoomScale);

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
  const input = new StrokeInput({
    strokes: () => strokes,
    persist: persistStrokes,
    recalcScores,
    exercises: () => exercises,
    pageFromEvent,
    mapper: canvasMapper,
    redraw: scheduleRedraw,
    zoom,
    scrollBy: (dx, dy) => canvasViewport?.scrollBy({ left: dx, top: dy }),
  });

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
    input.discard();
    persistStrokes([]);
    recalcScores();
    redrawAllOverlays();
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
    // The previous student's stroke in progress is dropped, never committed onto the next one.
    input.discard();
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
      await showMessage(translate($sessionStore.sessionKey ? "grading.canvas.scanMissing" : "grading.canvas.scanNoKey"), cssVar("--color-muted", "#64748b"), 150);
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

  let scrollFrame = 0;
  // One page lookup per frame: it measures every page, and scroll events come faster than frames.
  function onViewportScroll() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      updateCurrentPageFromScroll();
    });
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
      input.finish();
      scrollToPage(state.currentPage - 1);
    }
  }

  export function goPageNext() {
    const state = get(gradingStore);
    if (state.currentPage < state.totalPages) {
      input.finish();
      scrollToPage(state.currentPage + 1);
    }
  }

  function pageFromEvent(e: PointerEvent): number | null {
    const el = (e.target as Element | null)?.closest?.("[data-page]") as HTMLElement | null;
    const page = Number(el?.dataset.page);
    return page >= 1 && page <= pageSizes.length ? page : null;
  }

  /** Maps client coordinates to the page's canvas pixels; measures the overlay once per call site, not per coalesced event. */
  function canvasMapper(page: number): ((e: { clientX: number; clientY: number }) => { x: number; y: number }) | null {
    const overlay = overlayCanvases[page - 1];
    if (!overlay) return null;
    const rect = overlay.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const sx = overlay.width / rect.width;
    const sy = overlay.height / rect.height;
    return (e) => ({ x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy });
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
    const onHidden = () => {
      if (document.visibilityState === "hidden") input.reset();
    };
    window.addEventListener("blur", input.reset);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("blur", input.reset);
      document.removeEventListener("visibilitychange", onHidden);
      if (redrawFrame) cancelAnimationFrame(redrawFrame);
      if (scrollFrame) cancelAnimationFrame(scrollFrame);
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
    const live = input.live;
    if (live && (live.pageNumber ?? 1) === page) {
      drawStrokes(ctx, [live], page);
      liveDrawnFor = live;
      liveDrawn = live.points.length;
    }
  }

  // At most one redraw per frame: pointer events (above all a pen's) arrive faster than the screen refreshes.
  let redrawFrame = 0;
  const pagesToRedraw = new Set<number>();

  /** Redraws `page` in the next frame; null only draws the live pen stroke's new points. */
  function scheduleRedraw(page: number | null) {
    if (page !== null) pagesToRedraw.add(page);
    if (!redrawFrame) redrawFrame = requestAnimationFrame(flushRedraws);
  }

  function flushRedraws() {
    redrawFrame = 0;
    const pages = [...pagesToRedraw];
    pagesToRedraw.clear();
    for (const page of pages) redrawOverlay(page);
    const live = input.live;
    if (live?.tool !== "pen") return;
    if (liveDrawnFor !== live) {
      liveDrawnFor = live;
      liveDrawn = 0;
    }
    if (liveDrawn >= live.points.length) return;
    const ctx = overlayCanvases[(live.pageNumber ?? 1) - 1]?.getContext("2d");
    if (!ctx) return;
    drawPenSegment(ctx, live.points, liveDrawn);
    liveDrawn = live.points.length;
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
      { subExerciseLetters, scoreInputs: state.scoreInputs }
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
    const mcState = mcStateNow;
    const letters = subExerciseLetters;
    const scores = scoreInputsNow;
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
    const zoomScale = zoomScaleNow;
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
  onscroll={onViewportScroll}
>
  <!-- No `max-w-full` here: it silently clamped every zoom above 100% instead of letting the viewport scroll, so zooming in did nothing. -->
  <!-- touch-none and select-none on the whole stack: fingers pan and pinch through our handlers (also between pages), and a long press never selects or opens a menu that cancels the pen. -->
  <div
    class="relative mx-auto flex touch-none flex-col gap-2 select-none"
    style="width: {zoomScaleNow * 100}%;"
    role="presentation"
    onpointerdown={input.down}
    onpointermove={input.move}
    onpointerup={input.end}
    onpointercancel={input.end}
    onlostpointercapture={input.end}
    oncontextmenu={(e) => e.preventDefault()}
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
