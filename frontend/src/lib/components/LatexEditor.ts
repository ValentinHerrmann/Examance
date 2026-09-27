import { EditorView, Decoration, WidgetType, type DecorationSet } from "@codemirror/view";
import { StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";
import { HighlightStyle } from "@codemirror/language";
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

export const latexHighlightStyle = HighlightStyle.define([
  { tag: t.comment, color: "#94a3b8", fontStyle: "italic" },
  { tag: t.keyword, color: "#ec4899", fontWeight: "bold" },
  { tag: t.macroName, color: "#38bdf8", fontWeight: "600" },
  { tag: t.bracket, color: "#f59e0b" },
  { tag: t.string, color: "#a855f7" },
  { tag: t.number, color: "#10b981" }
]);

export const latexTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#0f172a",
      color: "#e2e8f0",
      borderRadius: "0.375rem",
      border: "1px solid #334155",
      fontSize: "0.875rem",
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace"
    },
    "&.cm-focused": {
      outline: "2px solid #38bdf8",
      outlineOffset: "-1px"
    },
    ".cm-content": {
      caretColor: "#38bdf8",
      padding: "0 12px"
    },
    ".cm-line": {
      padding: "0",
      lineHeight: "1.5rem"
    },
    ".cm-gutters": {
      backgroundColor: "#0f172a",
      color: "#64748b",
      borderRight: "1px solid #334155",
      borderRadius: "0.375rem 0 0 0.375rem"
    },
    ".cm-gutterElement": {
      padding: "0 8px 0 12px"
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "#f1f5f9"
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#38bdf8"
    },
    "&.cm-editor": {
      height: "100%"
    },
    ".cm-scroller": {
      overflow: "auto"
    },
    ".cm-diff-line-added": {
      backgroundColor: "rgba(16, 185, 129, 0.15) !important"
    },
    ".cm-diff-line-removed": {
      backgroundColor: "rgba(239, 68, 68, 0.15) !important"
    },
    ".cm-diff-line-modified": {
      backgroundColor: "rgba(245, 158, 11, 0.15) !important"
    },
    ".cm-diff-word-added": {
      backgroundColor: "rgba(16, 185, 129, 0.35)",
      color: "#6ee7b7",
      borderRadius: "2px",
      textDecoration: "underline"
    },
    ".cm-diff-word-removed": {
      backgroundColor: "rgba(239, 68, 68, 0.35)",
      color: "#fca5a5",
      borderRadius: "2px",
      textDecoration: "line-through"
    },
    ".cm-diff-line-padding": {
      display: "block",
      boxSizing: "border-box",
      background: "transparent"
    },
    // border-box keeps the dashed borders inside the explicit height, so a
    // gap spacer is exactly as tall as the lines it stands in for.
    ".cm-diff-gap-spacer": {
      backgroundColor: "rgba(15, 23, 42, 0.6)",
      backgroundImage:
        "repeating-linear-gradient(45deg, #1e293b 0, #1e293b 8px, #0f172a 8px, #0f172a 16px)",
      borderTop: "1px dashed #334155",
      borderBottom: "1px dashed #334155",
      display: "block",
      boxSizing: "border-box"
    }
  },
  { dark: true }
);

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
