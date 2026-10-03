<script module lang="ts">
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
  import { onMount, onDestroy, untrack } from "svelte";
  import { EditorView, BlockType, keymap, drawSelection, lineNumbers } from "@codemirror/view";
  import { EditorState, EditorSelection, Compartment } from "@codemirror/state";
  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
  import { StreamLanguage, syntaxHighlighting } from "@codemirror/language";
  import {
    latexHighlightStyle,
    createLatexTheme,
    diffDecorationsField,
    applyDiffDecorations
  } from "./LatexEditor";
  import { QUICK_INSERT_MACROS, type QuickInsertMacro } from "$lib/latex/quickInsertMacros";
  import { computeQuickInsert } from "$lib/latex/quickInsertLogic";
  import { t, type TranslationKey } from "$lib/i18n";
  import { theme } from "$lib/stores/theme";

  interface Props {
    value?: string;
    rows?: number;
    readonly?: boolean;
    diffDecorations?: DiffDecorationConfig | null;
    showQuickInsert?: boolean;
    /** Called when CodeMirror re-measures line heights (re-wrap, resize, edit). */
    onGeometryChange?: (() => void) | null;
    onChange?: (value: string) => void;
    onScroll?: (detail: { scrollTop: number; scrollLeft: number }) => void;
  }

  let {
    value = $bindable(""),
    rows = 8,
    readonly = false,
    diffDecorations = null,
    showQuickInsert = false,
    onGeometryChange = null,
    onChange,
    onScroll
  }: Props = $props();

  // Applied to both wrapper divs: flex ancestors (the editor's stacked phone column)
  // can otherwise collapse them to ~0px and CodeMirror paints into a collapsed box.
  let wrapperMinHeight = $derived(`${Math.max(rows, 3) * 1.5}rem`);

  let macroCategories = $derived((["solutions", "scoring", "formatting", "generic"] as const).map((category) => ({
    category,
    macros: QUICK_INSERT_MACROS.filter((m) => m.category === category)
  })));
  let categoryLabels = $derived({
    solutions: $t("editor.categories.solutions"),
    scoring: $t("editor.categories.scoring"),
    formatting: $t("editor.categories.formatting"),
    generic: $t("editor.categories.generic")
  } satisfies Record<QuickInsertMacro["category"], string>);

  // Palette text is keyed by macro id, so the key is only known at runtime and
  // has to be cast. A key missing from the catalogs renders as the key itself
  // rather than an empty button.
  function macroLabel(macro: QuickInsertMacro) {
    return $t(`editor.macros.${macro.id}.label` as TranslationKey);
  }
  function macroDescription(macro: QuickInsertMacro) {
    return $t(`editor.macros.${macro.id}.description` as TranslationKey);
  }

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
  let hoveredMacro: QuickInsertMacro | null = $state.raw(null);
  let tooltipX = $state(0);
  let tooltipY = $state(0);
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

  let container: HTMLDivElement | undefined = $state();
  let view: EditorView | null = $state.raw(null);
  let isInternalUpdate = $state(false);
  let isSyncingScroll = false;
  let handleScrollListener: (() => void) | null = null;
  const editableCompartment = new Compartment();
  const themeCompartment = new Compartment();

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

  // Rendered text height per line (incl. soft wraps). Diff padding/gap widgets are excluded:
  // they are sized from these numbers, so counting them would feed back into the next measure.
  export function getLineHeights(): Map<number, number> {
    const heights = new Map<number, number>();
    if (!view) return heights;
    const doc = view.state.doc;
    for (let l = 1; l <= doc.lines; l++) {
      try {
        const lineObj = doc.line(l);
        const block = view.lineBlockAt(lineObj.from);
        const height = Array.isArray(block.type)
          ? block.type
              .filter((sub) => sub.type === BlockType.Text)
              .reduce((sum, sub) => sum + sub.height, 0)
          : block.height;
        heights.set(l, height);
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
        themeCompartment.of(createLatexTheme($theme === "dark")),
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
            onChange?.(value);
            isInternalUpdate = false;
          }
          if (update.geometryChanged || update.heightChanged) {
            onGeometryChange?.();
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
      onScroll?.({
        scrollTop: scrollDOM.scrollTop,
        scrollLeft: scrollDOM.scrollLeft
      });
    };
    scrollDOM.addEventListener("scroll", handleScrollListener, { passive: true });
  });

  $effect.pre(() => {
    const v = view;
    const decorations = diffDecorations;
    if (!v) return;
    untrack(() => applyDiffDecorations(v, decorations));
  });

  // External `value` changes sync into CodeMirror; typing sets isInternalUpdate so it doesn't loop.
  $effect.pre(() => {
    const v = view;
    const internal = isInternalUpdate;
    const next = value;
    if (!v || internal) return;
    untrack(() => {
      const currentDoc = v.state.doc.toString();
      if (currentDoc !== next) {
        v.dispatch({
          changes: { from: 0, to: currentDoc.length, insert: next }
        });
      }
    });
  });

  $effect.pre(() => {
    const v = view;
    const ro = readonly;
    if (!v) return;
    untrack(() => {
      v.dispatch({
        effects: editableCompartment.reconfigure(EditorView.editable.of(!ro))
      });
    });
  });

  $effect.pre(() => {
    const v = view;
    const dark = $theme === "dark";
    if (!v) return;
    untrack(() => {
      v.dispatch({
        effects: themeCompartment.reconfigure(createLatexTheme(dark))
      });
    });
  });

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
    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface-raised px-2 py-1.5">
      {#each macroCategories as { category, macros } (category)}
        {#if macros.length > 0}
          <div class="flex flex-wrap items-center gap-1">
            <span class="text-xs font-semibold text-muted">
              {categoryLabels[category]}
            </span>
            {#each macros as macro (macro.id)}
              <button
                type="button"
                class="rounded-md border border-line bg-surface-sunken px-2 py-0.5 text-xs text-accent hover:border-primary hover:bg-surface-raised"
                onclick={() => insertMacro(macro)}
                onmouseenter={(e) => scheduleTooltip(macro, e.currentTarget)}
                onmouseleave={hideTooltip}
                onfocus={(e) => scheduleTooltip(macro, e.currentTarget)}
                onblur={hideTooltip}
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
    class="pointer-events-none fixed flex max-w-xs flex-col gap-1 rounded-md border border-line bg-surface-base px-2 py-1.5 text-xs shadow-md"
    style="left: {tooltipX}px; top: {tooltipY}px; z-index: var(--z-toast);"
  >
    <span class="text-content">{macroDescription(hoveredMacro)}</span>
    <code class="rounded-md bg-surface-sunken px-1.5 py-1 font-mono text-accent">{hoveredMacro.preview}</code>
  </div>
{/if}
