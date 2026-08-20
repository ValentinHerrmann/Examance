<script context="module" lang="ts">
  export interface DiffWordDecoration {
    startCol: number;
    endCol: number;
    type: "added" | "removed";
  }

  export interface DiffLineDecoration {
    lineNumber: number;
    type: "added" | "removed" | "modified" | "unchanged";
    words?: DiffWordDecoration[];
  }

  export interface DiffLinePaddingDecoration {
    lineNumber: number;
    paddingPx: number;
  }

  export interface DiffGapDecoration {
    afterLineNumber: number;
    gapPx: number;
  }

  export interface DiffDecorationConfig {
    lines: DiffLineDecoration[];
    paddings?: DiffLinePaddingDecoration[];
    gaps: DiffGapDecoration[];
  }

  export interface ScrollInfo {
    scrollTop: number;
    scrollLeft: number;
    lineNo: number | null;
    lineTop: number;
    lineHeight: number;
    ratio: number;
  }
</script>

<script lang="ts">
  import "./LatexEditor.css";
  import { onMount, onDestroy, createEventDispatcher } from "svelte";
  import { EditorView, keymap, drawSelection, lineNumbers } from "@codemirror/view";
  import { EditorState, EditorSelection, Compartment } from "@codemirror/state";
  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
  import { StreamLanguage, syntaxHighlighting } from "@codemirror/language";
  import {
    latexHighlightStyle,
    latexTheme,
    diffDecorationsField,
    applyDiffDecorations
  } from "./LatexEditor";
  import { QUICK_INSERT_MACROS, type QuickInsertMacro } from "$lib/latex/quickInsertMacros";
  import { computeQuickInsert } from "$lib/latex/quickInsertLogic";
  import { t, type TranslationKey } from "$lib/i18n";

  export let value: string = "";
  export let rows: number = 8;
  export let readonly: boolean = false;
  export let diffDecorations: DiffDecorationConfig | null = null;
  export let showQuickInsert: boolean = false;

  // Applied to both wrapper divs below, not just CodeMirror's internal nodes.
  // Ancestors that mix `flex-1`/`h-full`/`min-h-0` (the exercise editor's
  // stacked-on-phone column, in particular) can resolve these wrappers to
  // ~0px during flex layout since they had no explicit floor of their own —
  // CodeMirror would then paint content that overflowed a collapsed box
  // rather than a visibly-sized editor. An explicit min-height here beats
  // that regardless of how the ancestors' flex math comes out.
  $: wrapperMinHeight = `${Math.max(rows, 3) * 1.5}rem`;

  $: macroCategories = (["solutions", "scoring", "formatting", "generic"] as const).map((category) => ({
    category,
    macros: QUICK_INSERT_MACROS.filter((m) => m.category === category)
  }));
  $: categoryLabels = {
    solutions: $t("editor.categories.solutions"),
    scoring: $t("editor.categories.scoring"),
    formatting: $t("editor.categories.formatting"),
    generic: $t("editor.categories.generic")
  } satisfies Record<QuickInsertMacro["category"], string>;

  // Palette text is keyed by macro id, so the key is only known at runtime and
  // has to be cast. A key missing from the catalogs renders as the key itself
  // rather than an empty button.
  $: macroLabel = (macro: QuickInsertMacro) =>
    $t(`editor.macros.${macro.id}.label` as TranslationKey);
  $: macroDescription = (macro: QuickInsertMacro) =>
    $t(`editor.macros.${macro.id}.description` as TranslationKey);

  function insertMacro(macro: QuickInsertMacro) {
    if (!view) return;
    const sel = view.state.selection.main;
    const selectedText = view.state.doc.sliceString(sel.from, sel.to);
    const result = computeQuickInsert(macro, selectedText, sel.from, sel.to);
    view.dispatch({
      changes: result.changes,
      selection: EditorSelection.range(result.selection.anchor, result.selection.head)
    });
    view.focus();
  }

  const TOOLTIP_OPEN_DELAY_MS = 120;
  let hoveredMacro: QuickInsertMacro | null = null;
  let tooltipX = 0;
  let tooltipY = 0;
  let hoverTimer: ReturnType<typeof setTimeout> | null = null;

  function scheduleTooltip(macro: QuickInsertMacro, target: HTMLElement) {
    if (hoverTimer) clearTimeout(hoverTimer);
    const rect = target.getBoundingClientRect();
    hoverTimer = setTimeout(() => {
      hoveredMacro = macro;

      // Clamp to the viewport: anchored straight to the trigger's coordinates,
      // the tooltip hung off the screen near the right and bottom edges.
      const width = 320; // matches max-w-xs
      const estimatedHeight = 96;
      const margin = 8;
      tooltipX = Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin));
      tooltipY =
        rect.bottom + 6 + estimatedHeight > window.innerHeight - margin
          ? Math.max(margin, rect.top - estimatedHeight - 6)
          : rect.bottom + 6;
    }, TOOLTIP_OPEN_DELAY_MS);
  }

  function hideTooltip() {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    hoveredMacro = null;
  }

  const dispatch = createEventDispatcher<{
    change: string;
    scroll: { scrollTop: number; scrollLeft: number };
  }>();

  let container: HTMLDivElement;
  let view: EditorView | null = null;
  let isInternalUpdate = false;
  let isSyncingScroll = false;
  let handleScrollListener: (() => void) | null = null;
  const editableCompartment = new Compartment();

  export function setScroll(scrollTop: number, scrollLeft: number) {
    if (!view || !view.scrollDOM) return;
    const dom = view.scrollDOM;
    if (Math.abs(dom.scrollTop - scrollTop) > 0.5 || Math.abs(dom.scrollLeft - scrollLeft) > 0.5) {
      isSyncingScroll = true;
      dom.scrollTop = scrollTop;
      dom.scrollLeft = scrollLeft;
      requestAnimationFrame(() => {
        isSyncingScroll = false;
      });
    }
  }

  export function getScroll(): { scrollTop: number; scrollLeft: number } {
    if (!view || !view.scrollDOM) return { scrollTop: 0, scrollLeft: 0 };
    return {
      scrollTop: view.scrollDOM.scrollTop,
      scrollLeft: view.scrollDOM.scrollLeft
    };
  }

  export function getScrollInfo(): ScrollInfo {
    if (!view || !view.scrollDOM) {
      return { scrollTop: 0, scrollLeft: 0, lineNo: null, lineTop: 0, lineHeight: 1, ratio: 0 };
    }
    const dom = view.scrollDOM;
    const scrollTop = dom.scrollTop;
    const scrollLeft = dom.scrollLeft;

    try {
      const block = view.lineBlockAtHeight(scrollTop);
      const lineNo = view.state.doc.lineAt(block.from).number;
      const lineTop = block.top;
      const lineHeight = Math.max(block.height, 1);
      const ratio = Math.max(0, Math.min(1, (scrollTop - lineTop) / lineHeight));
      return { scrollTop, scrollLeft, lineNo, lineTop, lineHeight, ratio };
    } catch {
      return { scrollTop, scrollLeft, lineNo: null, lineTop: 0, lineHeight: 1, ratio: 0 };
    }
  }

  export function scrollToLine(lineNo: number, ratio: number, scrollLeft?: number) {
    if (!view || !view.scrollDOM) return;
    try {
      const doc = view.state.doc;
      const clampedLine = Math.max(1, Math.min(lineNo, doc.lines));
      const lineObj = doc.line(clampedLine);
      const block = view.lineBlockAt(lineObj.from);
      const targetTop = block.top + ratio * block.height;
      setScroll(targetTop, scrollLeft ?? view.scrollDOM.scrollLeft);
    } catch {
      setScroll(0, scrollLeft ?? view.scrollDOM.scrollLeft);
    }
  }

  export function getLineHeights(): Map<number, number> {
    const heights = new Map<number, number>();
    if (!view) return heights;
    const doc = view.state.doc;
    for (let l = 1; l <= doc.lines; l++) {
      try {
        const lineObj = doc.line(l);
        const block = view.lineBlockAt(lineObj.from);
        heights.set(l, block.height);
      } catch {
        // Fallback
      }
    }
    return heights;
  }

  onMount(() => {
    const minHeight = wrapperMinHeight;

    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        EditorView.lineWrapping,
        history(),
        drawSelection(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        StreamLanguage.define({
          token(stream) {
            if (stream.match(/^%.*/)) return "comment";
            if (stream.match(/^\\(?:begin|end)\b/)) return "keyword";
            if (stream.match(/^\\[a-zA-Z]+/)) return "macroName";
            if (stream.match(/^\\./)) return "macroName";
            if (stream.match(/^[{}[\]]/)) return "bracket";
            if (stream.match(/^\$+/)) return "string";
            if (stream.match(/^\d+(?:\.\d+)?/)) return "number";
            stream.next();
            return null;
          }
        }),
        syntaxHighlighting(latexHighlightStyle),
        latexTheme,
        diffDecorationsField,
        editableCompartment.of(EditorView.editable.of(!readonly)),
        EditorView.theme({
          "&": { minHeight },
          ".cm-scroller": { minHeight }
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            isInternalUpdate = true;
            value = update.state.doc.toString();
            dispatch("change", value);
            isInternalUpdate = false;
          }
        })
      ]
    });

    view = new EditorView({
      state,
      parent: container
    });

    const scrollDOM = view.scrollDOM;
    handleScrollListener = () => {
      if (isSyncingScroll) return;
      dispatch("scroll", {
        scrollTop: scrollDOM.scrollTop,
        scrollLeft: scrollDOM.scrollLeft
      });
    };
    scrollDOM.addEventListener("scroll", handleScrollListener, { passive: true });
  });

  $: if (view) {
    applyDiffDecorations(view, diffDecorations);
  }

  $: if (view && !isInternalUpdate) {
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== value) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: value }
      });
    }
  }

  $: if (view) {
    view.dispatch({
      effects: editableCompartment.reconfigure(EditorView.editable.of(!readonly))
    });
  }

  onDestroy(() => {
    if (hoverTimer) clearTimeout(hoverTimer);
    if (view) {
      if (handleScrollListener && view.scrollDOM) {
        view.scrollDOM.removeEventListener("scroll", handleScrollListener);
      }
      view.destroy();
    }
  });
</script>

<div
  class="flex w-full h-full flex-1 min-h-0 flex-col overflow-hidden"
  style="min-height: {wrapperMinHeight}"
>
  {#if showQuickInsert && !readonly}
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-700 bg-slate-800 px-2 py-1.5">
      {#each macroCategories as { category, macros } (category)}
        {#if macros.length > 0}
          <div class="flex flex-wrap items-center gap-1">
            <span class="text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
              {categoryLabels[category]}
            </span>
            {#each macros as macro (macro.id)}
              <button
                type="button"
                class="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[0.7rem] text-sky-300 hover:border-sky-400 hover:bg-slate-800"
                on:click={() => insertMacro(macro)}
                on:mouseenter={(e) => scheduleTooltip(macro, e.currentTarget)}
                on:mouseleave={hideTooltip}
                on:focus={(e) => scheduleTooltip(macro, e.currentTarget)}
                on:blur={hideTooltip}
              >
                {macroLabel(macro)}
              </button>
            {/each}
          </div>
        {/if}
      {/each}
    </div>
  {/if}
  <div
    class="flex w-full flex-1 min-h-0 flex-col overflow-hidden"
    style="min-height: {wrapperMinHeight}"
    bind:this={container}
  ></div>
</div>

{#if hoveredMacro}
  <div
    class="pointer-events-none fixed flex max-w-xs flex-col gap-1 rounded border border-line bg-surface-base px-2 py-1.5 text-[0.7rem] shadow-lg"
    style="left: {tooltipX}px; top: {tooltipY}px; z-index: var(--z-toast);"
  >
    <span class="text-slate-300">{macroDescription(hoveredMacro)}</span>
    <code class="rounded bg-slate-950 px-1.5 py-1 font-mono text-sky-300">{hoveredMacro.preview}</code>
  </div>
{/if}
