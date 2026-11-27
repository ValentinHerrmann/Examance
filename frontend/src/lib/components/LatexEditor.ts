import { EditorView, Decoration, ViewPlugin, WidgetType, type Command, type DecorationSet, type ViewUpdate } from "@codemirror/view";
import {
  deleteCharBackward, deleteCharForward, insertNewlineAndIndent, insertTab,
  cursorCharLeft, cursorCharRight, cursorLineUp, cursorLineDown, cursorLineBoundaryBackward, cursorLineBoundaryForward,
  selectCharLeft, selectCharRight, selectLineUp, selectLineDown, selectLineBoundaryBackward, selectLineBoundaryForward,
  undo, redo,
} from "@codemirror/commands";
import { StateEffect, StateField, RangeSetBuilder, type Extension } from "@codemirror/state";
import { HighlightStyle, StreamLanguage } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type {
  DiffDecorationConfig,
  DiffLineDecoration
} from "./LatexEditor.svelte";

export class LinePaddingWidget extends WidgetType {
  constructor(public heightPx: number) {
    super();
  }

  toDOM() {
    const div = document.createElement("div");
    div.className = "cm-diff-line-padding";
    div.style.height = `${this.heightPx}px`;
    return div;
  }

  eq(other: LinePaddingWidget) {
    return Math.abs(other.heightPx - this.heightPx) < 0.5;
  }
}

export class GapSpacerWidget extends WidgetType {
  constructor(public heightPx: number) {
    super();
  }

  toDOM() {
    const div = document.createElement("div");
    div.className = "cm-diff-gap-spacer";
    div.style.height = `${this.heightPx}px`;
    return div;
  }

  eq(other: GapSpacerWidget) {
    return Math.abs(other.heightPx - this.heightPx) < 0.5;
  }
}

export const setDiffDecorationsEffect = StateEffect.define<DecorationSet>();

export const diffDecorationsField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setDiffDecorationsEffect)) {
        decorations = effect.value;
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f)
});

/** The editor's LaTeX tokenizer; also highlights `latex` code blocks in the AI prompt preview. */
export const latexLanguage = StreamLanguage.define({
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
});

/** Markdown marks of the AI prompt preview. List items stay plain so their inline code and LaTeX colours stand out. */
export const markdownHighlightStyle = HighlightStyle.define([
  { tag: [t.heading1, t.heading2, t.heading3], fontWeight: "bold", color: "var(--color-content)" },
  { tag: t.heading1, fontSize: "1.15em" },
  { tag: t.processingInstruction, color: "var(--color-syntax-comment)" },
  { tag: t.monospace, color: "var(--color-syntax-string)" },
  { tag: t.strong, fontWeight: "bold" }
]);

export const latexHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: "var(--color-syntax-comment)", fontStyle: "italic" },
  { tag: t.keyword, color: "var(--color-syntax-keyword)", fontWeight: "bold" },
  { tag: t.macroName, color: "var(--color-syntax-macro)", fontWeight: "600" },
  { tag: t.bracket, color: "var(--color-syntax-bracket)" },
  { tag: t.string, color: "var(--color-syntax-string)" },
  { tag: t.number, color: "var(--color-syntax-number)" }
]);

/** Editor chrome in design-token CSS variables so it follows the theme. `dark` only selects CodeMirror's base styles; LatexEditor.svelte swaps it via a Compartment. */
export function createLatexTheme(dark: boolean): Extension {
  return EditorView.theme(
    {
      // The OptionTile look (issue #228): sunken box, focused like a selected tile.
      // The text fields' look (`controlClass`), so the editor never reads as an option tile (issue #272).
      "&": {
        backgroundColor: "var(--color-control)",
        color: "var(--color-content)",
        borderRadius: "0.375rem",
        border: "1px solid var(--color-control-line)",
        boxShadow: "inset 0 2px 4px 0 rgb(0 0 0 / 0.05)",
        fontSize: "0.875rem",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
      },
      "&.cm-focused": {
        backgroundColor: "var(--color-highlight)",
        borderColor: "var(--color-primary)",
        outline: "2px solid var(--color-primary)",
        outlineOffset: "-1px"
      },
      ".cm-content": {
        caretColor: "var(--color-focus)",
        padding: "0 12px"
      },
      ".cm-line": {
        padding: "0",
        lineHeight: "1.5rem"
      },
      ".cm-gutters": {
        backgroundColor: "transparent",
        color: "var(--color-muted)",
        borderRight: "1px solid var(--color-line-strong)",
        borderRadius: "0.375rem 0 0 0.375rem"
      },
      ".cm-gutterElement": {
        padding: "0 8px 0 12px"
      },
      ".cm-activeLineGutter": {
        backgroundColor: "transparent",
        color: "var(--color-content)"
      },
      ".cm-cursor, .cm-dropCursor": {
        borderLeftColor: "var(--color-focus)"
      },
      "&.cm-editor": {
        height: "100%",
        flex: "1 1 auto"
      },
      ".cm-scroller": {
        overflow: "auto"
      },
      // Find/replace panel (@codemirror/search). The `&.cm-editor` prefix outranks the base theme's `&light`/`&dark` panel colours.
      "&.cm-editor .cm-panels": {
        backgroundColor: "var(--color-surface-raised)",
        color: "var(--color-content)",
        fontFamily: "inherit"
      },
      "&.cm-editor .cm-panels-top": {
        borderBottom: "1px solid var(--color-line)"
      },
      "&.cm-editor .cm-panel.cm-search": {
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "0.25rem 0.375rem",
        padding: "0.375rem 2rem 0.375rem 0.5rem",
        fontSize: "0.8125rem"
      },
      "&.cm-editor .cm-panel.cm-search .cm-textfield": {
        margin: "0",
        minWidth: "8rem",
        flex: "1 1 10rem",
        maxWidth: "16rem",
        minHeight: "1.75rem",
        padding: "0 0.5rem",
        fontSize: "inherit",
        color: "var(--color-content)",
        backgroundColor: "var(--color-control)",
        border: "1px solid var(--color-line-strong)",
        borderRadius: "0.375rem"
      },
      "&.cm-editor .cm-panel.cm-search .cm-textfield:focus": {
        outline: "2px solid var(--color-focus)",
        outlineOffset: "-1px"
      },
      "&.cm-editor .cm-panel.cm-search .cm-button": {
        margin: "0",
        minHeight: "1.75rem",
        padding: "0 0.625rem",
        fontSize: "inherit",
        color: "var(--color-accent)",
        backgroundColor: "var(--color-surface-sunken)",
        backgroundImage: "none",
        border: "1px solid var(--color-line-strong)",
        borderRadius: "0.375rem",
        cursor: "pointer"
      },
      "&.cm-editor .cm-panel.cm-search .cm-button:hover": {
        borderColor: "var(--color-primary)",
        backgroundColor: "var(--color-surface-raised)"
      },
      "&.cm-editor .cm-panel.cm-search .cm-button:active": {
        backgroundImage: "none",
        backgroundColor: "var(--color-surface-inset)"
      },
      "&.cm-editor .cm-panel.cm-search label": {
        display: "inline-flex",
        alignItems: "center",
        gap: "0.25rem",
        fontSize: "inherit",
        color: "var(--color-muted)"
      },
      "&.cm-editor .cm-panel.cm-search [name=close]": {
        top: "0.25rem",
        right: "0.375rem",
        padding: "0 0.375rem",
        fontSize: "1.25rem",
        lineHeight: "1.5rem",
        color: "var(--color-muted)",
        cursor: "pointer"
      },
      "&.cm-editor .cm-panel.cm-search [name=close]:hover": {
        color: "var(--color-content)"
      },
      ".cm-searchMatch": {
        backgroundColor: "color-mix(in srgb, var(--color-warning) 35%, transparent)",
        outline: "1px solid color-mix(in srgb, var(--color-warning) 60%, transparent)"
      },
      ".cm-searchMatch.cm-searchMatch-selected": {
        backgroundColor: "color-mix(in srgb, var(--color-primary) 40%, transparent)",
        outline: "1px solid var(--color-primary)"
      },
      ".cm-selectionMatch": {
        backgroundColor: "color-mix(in srgb, var(--color-primary) 20%, transparent)"
      },
      ".cm-diff-line-added": {
        backgroundColor: "color-mix(in srgb, var(--color-success-fg) 15%, transparent) !important"
      },
      ".cm-diff-line-removed": {
        backgroundColor: "color-mix(in srgb, var(--color-danger-fg) 15%, transparent) !important"
      },
      ".cm-diff-line-modified": {
        backgroundColor: "color-mix(in srgb, var(--color-syntax-bracket) 15%, transparent) !important"
      },
      ".cm-diff-word-added": {
        backgroundColor: "color-mix(in srgb, var(--color-success-fg) 30%, transparent)",
        color: "var(--color-success-fg)",
        borderRadius: "2px",
        textDecoration: "underline"
      },
      ".cm-diff-word-removed": {
        backgroundColor: "color-mix(in srgb, var(--color-danger-fg) 30%, transparent)",
        color: "var(--color-danger-fg)",
        borderRadius: "2px",
        textDecoration: "line-through"
      },
      ".cm-diff-line-padding": {
        display: "block",
        boxSizing: "border-box",
        background: "transparent"
      },
      // border-box keeps the dashed borders inside the explicit height, so a gap spacer is exactly as tall as the lines it stands in for.
      ".cm-diff-gap-spacer": {
        backgroundColor: "var(--color-surface-sunken)",
        backgroundImage:
          "repeating-linear-gradient(45deg, var(--color-surface-inset) 0, var(--color-surface-inset) 8px, var(--color-surface-sunken) 8px, var(--color-surface-sunken) 16px)",
        borderTop: "1px dashed var(--color-line-strong)",
        borderBottom: "1px dashed var(--color-line-strong)",
        display: "block",
        boxSizing: "border-box"
      }
    },
    { dark }
  );
}

/** Adds the line background and the word marks of one changed line. */
function addLineDiff(builder: RangeSetBuilder<Decoration>, lineObj: { from: number; to: number }, lineDeco: DiffLineDecoration) {
  builder.add(
    lineObj.from,
    lineObj.from,
    Decoration.line({
      attributes: { class: `cm-diff-line-${lineDeco.type}` }
    })
  );

  for (const w of lineDeco.words ?? []) {
    const fromPos = Math.min(lineObj.from + w.startCol, lineObj.to);
    const toPos = Math.min(lineObj.from + w.endCol, lineObj.to);
    if (fromPos < toPos) {
      builder.add(
        fromPos,
        toPos,
        Decoration.mark({
          class: `cm-diff-word-${w.type}`
        })
      );
    }
  }
}

/** Adds a block spacer widget of `px` height at `pos` when positive. */
function addSpacer(
  builder: RangeSetBuilder<Decoration>,
  pos: number,
  px: number | undefined,
  widget: (px: number) => WidgetType,
  side: number
) {
  if (px === undefined || Number.isNaN(px) || px <= 0) return;
  builder.add(pos, pos, Decoration.widget({ widget: widget(px), side, block: true }));
}

export function applyDiffDecorations(
  editorView: EditorView,
  config: DiffDecorationConfig | null
) {
  if (!editorView) return;
  if (!config) {
    editorView.dispatch({
      effects: setDiffDecorationsEffect.of(Decoration.none)
    });
    return;
  }

  const doc = editorView.state.doc;
  const totalLines = doc.lines;
  const builder = new RangeSetBuilder<Decoration>();

  const lineDecoMap = new Map<number, DiffLineDecoration>();
  for (const lineDeco of config.lines) {
    lineDecoMap.set(lineDeco.lineNumber, lineDeco);
  }

  const paddingMap = new Map<number, number>();
  for (const pDeco of config.paddings ?? []) {
    paddingMap.set(pDeco.lineNumber, pDeco.paddingPx);
  }

  const gapMap = new Map<number, number>();
  for (const gapDeco of config.gaps) {
    gapMap.set(gapDeco.afterLineNumber, gapDeco.gapPx);
  }

  const gapWidget = (px: number) => new GapSpacerWidget(px);
  if (totalLines >= 1) addSpacer(builder, doc.line(1).from, gapMap.get(0), gapWidget, -1);

  for (let l = 1; l <= totalLines; l++) {
    const lineObj = doc.line(l);
    const lineDeco = lineDecoMap.get(l);

    if (lineDeco && lineDeco.type !== "unchanged") addLineDiff(builder, lineObj, lineDeco);

    addSpacer(builder, lineObj.to, paddingMap.get(l), (px) => new LinePaddingWidget(px), 1);
    addSpacer(builder, lineObj.to, gapMap.get(l), gapWidget, 1);
  }

  editorView.dispatch({
    effects: setDiffDecorationsEffect.of(builder.finish())
  });
}

/** Editing keys the PDF pages forward to the editor (inline editing, issue #347). */
export type EditorKey =
  | "Backspace" | "Delete" | "Enter" | "Tab"
  | "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End"
  | "Undo" | "Redo";

/** The CodeMirror command of each forwarded key, its selecting variant (with Shift), and whether it changes the text. */
export const EDITOR_KEY_COMMANDS: Record<EditorKey, { move: Command; select?: Command; edits: boolean }> = {
  Backspace: { move: deleteCharBackward, edits: true },
  Delete: { move: deleteCharForward, edits: true },
  Enter: { move: insertNewlineAndIndent, edits: true },
  Tab: { move: insertTab, edits: true },
  ArrowLeft: { move: cursorCharLeft, select: selectCharLeft, edits: false },
  ArrowRight: { move: cursorCharRight, select: selectCharRight, edits: false },
  ArrowUp: { move: cursorLineUp, select: selectLineUp, edits: false },
  ArrowDown: { move: cursorLineDown, select: selectLineDown, edits: false },
  Home: { move: cursorLineBoundaryBackward, select: selectLineBoundaryBackward, edits: false },
  End: { move: cursorLineBoundaryForward, select: selectLineBoundaryForward, edits: false },
  Undo: { move: undo, edits: true },
  Redo: { move: redo, edits: true },
};

/** A muted, steady cursor while the editor is not focused (CodeMirror hides it then); the pages take the keys and the cursor still shows where they land. */
export const unfocusedCursorTheme = EditorView.theme({
  "&:not(.cm-focused) > .cm-scroller > .cm-cursorLayer .cm-cursor": { display: "block", opacity: "0.55" },
});

/** Shows where a click in the PDF put the cursor (issue #347): a halo at the cursor and a fading highlight of the selected lines, for `FLASH_MS`; `setFlash.of(null)` removes it. */
export const setFlash = StateEffect.define<{ from: number; to: number; head: number } | null>();
export const FLASH_MS = 800;

class FlashHalo extends WidgetType {
  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-flash-cursor";
    span.setAttribute("aria-hidden", "true");
    return span;
  }
  eq() {
    return true;
  }
}

export const flashField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setFlash)) continue;
      if (!e.value) return Decoration.none;
      const { from, to, head } = e.value;
      const b = new RangeSetBuilder<Decoration>();
      const doc = tr.state.doc;
      const first = doc.lineAt(from).number;
      const last = doc.lineAt(to).number;
      const marks: { at: number; deco: Decoration }[] = [];
      for (let n = first; n <= last; n++) marks.push({ at: doc.line(n).from, deco: Decoration.line({ class: "cm-flash-line" }) });
      marks.push({ at: head, deco: Decoration.widget({ widget: new FlashHalo(), side: 1 }) });
      marks.sort((x, y) => x.at - y.at || (x.deco.spec.widget ? 1 : -1));
      for (const m of marks) b.add(m.at, m.at, m.deco);
      return b.finish();
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** Removes a flash `FLASH_MS` after it was shown (a newer one restarts the wait). */
const flashTimer = ViewPlugin.fromClass(
  class {
    private timer: ReturnType<typeof setTimeout> | undefined;
    constructor(private readonly view: EditorView) {}
    update(u: ViewUpdate) {
      if (!u.transactions.some((tr) => tr.effects.some((e) => e.is(setFlash) && e.value))) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.view.dispatch({ effects: setFlash.of(null) }), FLASH_MS);
    }
    destroy() {
      clearTimeout(this.timer);
    }
  },
);

/** The flash's look: an accent halo that pulses out from the cursor and a background on the lines that fades, both gone after `FLASH_MS`; with reduced motion both stay still until then. */
export const flashTheme = EditorView.theme({
  ".cm-flash-cursor": {
    position: "relative",
    display: "inline-block",
    width: "0",
    height: "1.2em",
    verticalAlign: "text-bottom",
  },
  ".cm-flash-cursor::after": {
    content: '""',
    position: "absolute",
    left: "-0.6em",
    top: "0",
    width: "1.2em",
    height: "1.2em",
    borderRadius: "9999px",
    boxShadow: "0 0 0 2px var(--color-accent)",
    animation: `cm-flash-halo ${FLASH_MS}ms ease-out forwards`,
    pointerEvents: "none",
  },
  ".cm-flash-line": {
    animation: `cm-flash-line ${FLASH_MS}ms ease-out forwards`,
  },
  "@keyframes cm-flash-halo": {
    "0%": { opacity: "0.9", transform: "scale(0.6)" },
    "100%": { opacity: "0", transform: "scale(2.2)" },
  },
  "@keyframes cm-flash-line": {
    "0%": { backgroundColor: "color-mix(in srgb, var(--color-accent) 28%, transparent)" },
    "100%": { backgroundColor: "transparent" },
  },
  "@media (prefers-reduced-motion: reduce)": {
    ".cm-flash-cursor::after": { animation: "none", opacity: "0.9" },
    ".cm-flash-line": { animation: "none", backgroundColor: "color-mix(in srgb, var(--color-accent) 20%, transparent)" },
  },
});

/** Everything the flash needs in an editor: its decorations, its removal and its look. */
export const flashExtension = [flashField, flashTimer, flashTheme];
