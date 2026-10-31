import { EditorView, Decoration, WidgetType, type DecorationSet } from "@codemirror/view";
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
      "&": {
        backgroundColor: "var(--color-control)",
        color: "var(--color-content)",
        borderRadius: "0.375rem",
        border: "1px solid var(--color-line-strong)",
        fontSize: "0.875rem",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
      },
      "&.cm-focused": {
        outline: "2px solid var(--color-focus)",
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
        backgroundColor: "var(--color-control)",
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
  if (config.paddings) {
    for (const pDeco of config.paddings) {
      paddingMap.set(pDeco.lineNumber, pDeco.paddingPx);
    }
  }

  const gapMap = new Map<number, number>();
  for (const gapDeco of config.gaps) {
    gapMap.set(gapDeco.afterLineNumber, gapDeco.gapPx);
  }

  if (gapMap.has(0)) {
    const gapPx = gapMap.get(0)!;
    if (gapPx > 0 && totalLines >= 1) {
      const line1 = doc.line(1);
      builder.add(
        line1.from,
        line1.from,
        Decoration.widget({
          widget: new GapSpacerWidget(gapPx),
          side: -1,
          block: true
        })
      );
    }
  }

  for (let l = 1; l <= totalLines; l++) {
    const lineObj = doc.line(l);
    const lineDeco = lineDecoMap.get(l);

    if (lineDeco && lineDeco.type !== "unchanged") {
      builder.add(
        lineObj.from,
        lineObj.from,
        Decoration.line({
          attributes: { class: `cm-diff-line-${lineDeco.type}` }
        })
      );

      if (lineDeco.words && lineDeco.words.length > 0) {
        for (const w of lineDeco.words) {
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
    }

    if (paddingMap.has(l)) {
      const pPx = paddingMap.get(l)!;
      if (pPx > 0) {
        builder.add(
          lineObj.to,
          lineObj.to,
          Decoration.widget({
            widget: new LinePaddingWidget(pPx),
            side: 1,
            block: true
          })
        );
      }
    }

    if (gapMap.has(l)) {
      const gapPx = gapMap.get(l)!;
      if (gapPx > 0) {
        builder.add(
          lineObj.to,
          lineObj.to,
          Decoration.widget({
            widget: new GapSpacerWidget(gapPx),
            side: 1,
            block: true
          })
        );
      }
    }
  }

  editorView.dispatch({
    effects: setDiffDecorationsEffect.of(builder.finish())
  });
}
