<script module lang="ts">
  import type { EditorKey } from "#lib/components/LatexEditor";
  import type { PageClick, PageMarks } from "#lib/latex/clickToSource";

  /** What a PDF pane does with clicks and keys (issue #347): the Exam step only clicks, the exercise editor edits in the pages. */
  export interface PageEditProps {
    /** A tap or click on a page; `count` 1 places the caret, 2 selects a word, 3 a line. */
    onClick?: (click: PageClick, count: number) => void;
    /** A mouse drag from `from` to `to`: select between them; `done` when the button went up. */
    onDrag?: (from: PageClick, to: PageClick, done: boolean) => void;
    /** Text typed while the page has the focus (also a paste, a finished composition). */
    onText?: (text: string) => void;
    /** An editing key typed while the page has the focus; true when it was handled. */
    onKey?: (key: EditorKey, shift: boolean) => boolean;
    /** The editor's caret and selection, drawn over the pages. */
    marks?: PageMarks | null;
  }
</script>

<script lang="ts">
  // The input layer over a PDF viewer's shown pages: taps and clicks (never pans or pinches), drags, typing through a hidden textarea, and the caret and selection boxes; positions only through the viewer's `PageLocator` (`lib/pdf/embedpdf.ts`).
  import { onDestroy } from "svelte";
  import type { PageLocator } from "#lib/pdf/embedpdf";
  import { createTapTracker } from "#lib/pdf/tap";
  import { t } from "#lib/i18n";

  interface Props {
    host: HTMLElement;
    /** The shown layer's locator (null while none is shown). */
    locate: () => Promise<PageLocator | null>;
    /** The shown layer's scroll container, to follow scrolling. */
    scroller: () => HTMLElement | null;
    /** Bumped by the viewer on every PDF swap and zoom change. */
    version: number;
    edit: PageEditProps;
  }

  let { host, locate, scroller, version, edit }: Props = $props();

  let input: HTMLTextAreaElement | undefined = $state();
  let composing = false;
  let tapped = false;
  let dragFrom: PageClick | null = null;
  let dragging = false;
  let downAt: { x: number; y: number } | null = null;
  const taps = createTapTracker();
  /** Panning like a hand tool: the middle button, or the left one while Space is held. */
  let panFrom: { x: number; y: number } | null = null;
  let spaceHeld = false;
  /** Space panned instead of typing a space. */
  let spaceUsed = false;
  /** A touch held still this long selects the word under it. */
  const LONG_PRESS_MS = 500;
  let longPress: ReturnType<typeof setTimeout> | undefined;

  function setCursor() {
    if (!edit.onText) host.style.cursor = "";
    else if (panFrom) host.style.cursor = "grabbing";
    else host.style.cursor = spaceHeld ? "grab" : "text";
  }

  async function pointAt(clientX: number, clientY: number): Promise<PageClick | null> {
    const point = (await locate())?.pointAt(clientX, clientY);
    return point ? { ...point, clientX, clientY } : null;
  }

  /** Mouse and pen belong to the edit layer on editable pages: EmbedPDF's own text selection and pan never see them (touch keeps native scrolling and pinch zoom). */
  function own(e: PointerEvent) {
    if (edit.onText && e.pointerType !== "touch") e.stopPropagation();
  }

  function onDown(e: PointerEvent) {
    own(e);
    taps.down(e);
    dragging = false;
    dragFrom = null;
    clearTimeout(longPress);
    if (edit.onText && e.pointerType === "mouse" && (e.button === 1 || (e.button === 0 && spaceHeld))) {
      // The middle button's own autoscroll and the page's selection would fight the pan.
      e.preventDefault();
      panFrom = { x: e.clientX, y: e.clientY };
      spaceUsed = spaceHeld;
      downAt = null;
      setCursor();
      return;
    }
    if (e.pointerType === "touch" && e.isPrimary && edit.onText) {
      const { clientX, clientY } = e;
      longPress = setTimeout(() => {
        void pointAt(clientX, clientY).then((click) => {
          if (!click) return;
          edit.onClick?.(click, 2);
          focusInput();
        });
      }, LONG_PRESS_MS);
    }
    downAt = e.pointerType === "mouse" && e.button === 0 ? { x: e.clientX, y: e.clientY } : null;
    if (downAt && edit.onDrag) void pointAt(e.clientX, e.clientY).then((p) => (dragFrom = p));
  }

  let moveFrame = 0;
  function onMove(e: PointerEvent) {
    own(e);
    if (panFrom) {
      scroller()?.scrollBy({ left: panFrom.x - e.clientX, top: panFrom.y - e.clientY });
      panFrom = { x: e.clientX, y: e.clientY };
      return;
    }
    if (longPress !== undefined && taps.moved(e)) clearTimeout(longPress);
    if (!downAt || !dragFrom || !edit.onDrag || (e.buttons & 1) === 0) return;
    if (!dragging && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) < 6) return;
    dragging = true;
    const { clientX, clientY } = e;
    cancelAnimationFrame(moveFrame);
    moveFrame = requestAnimationFrame(() => {
      void pointAt(clientX, clientY).then((to) => {
        if (to && dragFrom) edit.onDrag?.(dragFrom, to, false);
      });
    });
  }

  function onUp(e: PointerEvent) {
    own(e);
    clearTimeout(longPress);
    longPress = undefined;
    if (panFrom) {
      taps.cancel(e);
      panFrom = null;
      tapped = false;
      setCursor();
      return;
    }
    tapped = taps.up(e) && !dragging;
    downAt = null;
    if (!dragging) return;
    const from = dragFrom;
    cancelAnimationFrame(moveFrame);
    void pointAt(e.clientX, e.clientY).then((to) => {
      if (to && from) edit.onDrag?.(from, to, true);
    });
    focusInput();
  }

  // Clicks carry the count (1, 2, 3); a click that ended a pan or a drag is not a tap and does nothing.
  function onClick(e: MouseEvent) {
    if (!tapped || !edit.onClick) return;
    tapped = false;
    const count = Math.min(3, Math.max(1, e.detail || 1));
    void pointAt(e.clientX, e.clientY).then((click) => {
      if (!click) return;
      edit.onClick?.(click, count);
      focusInput();
    });
  }

  function focusInput() {
    if (edit.onText) input?.focus({ preventScroll: true });
  }

  const KEYS = new Set(["Backspace", "Delete", "Enter", "Tab", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"]);

  function onKeydown(e: KeyboardEvent) {
    if (composing || !edit.onKey) return;
    const mod = e.ctrlKey || e.metaKey;
    // Space types a space when released without a drag; held during a drag it pans.
    if (e.key === " " && !mod && !e.altKey) {
      e.preventDefault();
      if (!e.repeat) {
        spaceHeld = true;
        spaceUsed = false;
        setCursor();
      }
      return;
    }
    let key: EditorKey | null = null;
    if (mod && !e.altKey && e.key.toLowerCase() === "z") key = e.shiftKey ? "Redo" : "Undo";
    else if (mod && !e.altKey && e.key.toLowerCase() === "y") key = "Redo";
    else if (!mod && KEYS.has(e.key)) key = e.key as EditorKey;
    if (key && edit.onKey(key, e.shiftKey)) e.preventDefault();
  }

  function onKeyup(e: KeyboardEvent) {
    if (e.key !== " " || !spaceHeld) return;
    spaceHeld = false;
    if (!spaceUsed) edit.onText?.(" ");
    setCursor();
  }

  function onInput(e: Event) {
    const ie = e as InputEvent;
    if (composing || !input) return;
    const text = ie.inputType === "insertLineBreak" ? "\n" : input.value;
    input.value = "";
    if (text) edit.onText?.(text);
  }

  function onCompositionEnd(e: CompositionEvent) {
    composing = false;
    if (input) input.value = "";
    if (e.data) edit.onText?.(e.data);
  }

  function onPaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData("text/plain");
    e.preventDefault();
    if (text) edit.onText?.(text);
  }

  $effect(() => {
    const h = host;
    h.addEventListener("pointerdown", onDown, { capture: true });
    h.addEventListener("pointermove", onMove, { capture: true, passive: true });
    h.addEventListener("pointerup", onUp, { capture: true, passive: true });
    h.addEventListener("pointercancel", taps.cancel, { capture: true, passive: true });
    h.addEventListener("click", onClick, { capture: true });
    return () => {
      h.removeEventListener("pointerdown", onDown, { capture: true });
      h.removeEventListener("pointermove", onMove, { capture: true });
      h.removeEventListener("pointerup", onUp, { capture: true });
      h.removeEventListener("pointercancel", taps.cancel, { capture: true });
      h.removeEventListener("click", onClick, { capture: true });
    };
  });

  // The text cursor over editable pages; panning and Space switch it to the hand.
  $effect(() => {
    host.style.cursor = edit.onText ? "text" : "";
  });

  // Marks in host pixels; recomputed on new marks, a swap or zoom (`version`) and every scroll of the pages.
  interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
  }
  let caretRect: Rect | null = $state(null);
  let boxRects: Rect[] = $state([]);
  let scrollTick = $state(0);

  $effect(() => {
    // Read so a swap (a new scroller) re-attaches the listener.
    const el = version >= 0 ? scroller() : null;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => scrollTick++);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("scroll", onScroll);
    };
  });

  $effect(() => {
    const marks = edit.marks;
    // A swap, zoom (version) or scroll (scrollTick) moves the marks: both are read so the effect follows them.
    const moved = version + scrollTick;
    if (!marks || moved < 0) {
      caretRect = null;
      boxRects = [];
      return;
    }
    let stale = false;
    void locate().then((locator) => {
      if (stale || !locator) return;
      const origin = host.getBoundingClientRect();
      const place = (page: number, x: number, top: number, width: number, height: number): Rect | null => {
        const at = locator.clientOf(page, x, top);
        return at ? { left: at.left - origin.left, top: at.top - origin.top, width: width * at.scale, height: height * at.scale } : null;
      };
      caretRect = marks.caret ? place(marks.caret.page, marks.caret.x, marks.caret.top, 0, marks.caret.height) : null;
      boxRects = marks.boxes.flatMap((b) => place(b.page, b.x, b.top, b.width, b.height) ?? []);
    });
    return () => {
      stale = true;
    };
  });

  // The caret pulses once per click in the code editor (`marks.flash`), not whenever it reappears.
  let pulse = $state(0);
  let seenFlash = 0;
  let pulseTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const flash = edit.marks?.flash ?? 0;
    if (flash === seenFlash) return;
    seenFlash = flash;
    pulse = flash;
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => (pulse = 0), 900);
  });

  onDestroy(() => {
    cancelAnimationFrame(moveFrame);
    clearTimeout(pulseTimer);
  });
</script>

{#each boxRects as r, i (i)}
  <div class="pointer-events-none absolute z-10 bg-primary/25" style:left="{r.left}px" style:top="{r.top}px" style:width="{r.width}px" style:height="{r.height}px"></div>
{/each}
{#if caretRect}
  <div
    class="page-caret pointer-events-none absolute z-10 w-0.5 bg-accent"
    data-testid="pdf-caret"
    style:left="{caretRect.left - 1}px"
    style:top="{caretRect.top}px"
    style:height="{caretRect.height}px"
  ></div>
  {#key pulse}
    {#if pulse}
      <!-- Pulses once where the caret appeared after a click in the code editor, so the eye finds it. -->
      <div
        class="page-caret-pulse pointer-events-none absolute z-10 rounded-full"
        data-testid="pdf-caret-pulse"
        style:left="{caretRect.left - caretRect.height / 2}px"
        style:top="{caretRect.top}px"
        style:width="{caretRect.height}px"
        style:height="{caretRect.height}px"
      ></div>
    {/if}
  {/key}
{/if}
{#if edit.onText}
  <!-- Takes the keys while the page has the focus; the caret drawn above is where they land. -->
  <textarea
    bind:this={input}
    class="pointer-events-none absolute top-0 left-0 h-px w-px opacity-0"
    aria-label={$t("editor.pdfPreview.typeHere")}
    autocapitalize="off"
    autocomplete="off"
    spellcheck="false"
    onkeydown={onKeydown}
    onkeyup={onKeyup}
    onblur={() => {
      spaceHeld = false;
      setCursor();
    }}
    oninput={onInput}
    oncompositionstart={() => (composing = true)}
    oncompositionend={onCompositionEnd}
    onpaste={onPaste}
  ></textarea>
{/if}

<style>
  .page-caret {
    animation: page-caret-blink 1.1s steps(1) infinite;
  }

  .page-caret-pulse {
    box-shadow: 0 0 0 2px var(--color-accent);
    opacity: 0;
    animation: page-caret-pulse 0.8s ease-out;
  }

  @keyframes page-caret-pulse {
    0% {
      opacity: 0.9;
      transform: scale(0.6);
    }
    100% {
      opacity: 0;
      transform: scale(2.2);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .page-caret-pulse {
      animation: page-caret-pulse-still 0.8s steps(1);
    }

    @keyframes page-caret-pulse-still {
      0% {
        opacity: 0.9;
      }
      100% {
        opacity: 0;
      }
    }
  }

  @keyframes page-caret-blink {
    50% {
      opacity: 0;
    }
  }
</style>
