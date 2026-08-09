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
  import { EditorState, Compartment } from "@codemirror/state";
  import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
  import { StreamLanguage, syntaxHighlighting } from "@codemirror/language";
  import {
    latexHighlightStyle,
    latexTheme,
    diffDecorationsField,
    applyDiffDecorations
  } from "./LatexEditor";

  export let value: string = "";
  export let rows: number = 8;
  export let readonly: boolean = false;
  export let diffDecorations: DiffDecorationConfig | null = null;

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
    const minHeight = `${Math.max(rows, 3) * 1.5}rem`;

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
    if (view) {
      if (handleScrollListener && view.scrollDOM) {
        view.scrollDOM.removeEventListener("scroll", handleScrollListener);
      }
      view.destroy();
    }
  });
</script>

<div class="flex w-full h-full flex-1 min-h-0 flex-col overflow-hidden" bind:this={container}></div>
