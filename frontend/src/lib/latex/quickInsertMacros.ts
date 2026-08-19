/**
 * Catalog of LaTeX snippets offered by the "quick insert" toolbar in
 * LatexEditor.svelte. Covers the exam template's answer-key macros
 * (backend/latex-assets/sty/Loesung.sty), scoring macros
 * (backend/latex-assets/sty/Schulaufgabe.sty), and a small set of
 * generic LaTeX constructs teachers commonly forget the syntax for.
 */

export interface QuickInsertArg {
  placeholder: string;
  optional?: boolean;
}

export interface ArgOffset {
  from: number;
  to: number;
}

export interface QuickInsertTemplate {
  text: string;
  argOffsets: ArgOffset[];
}

export interface QuickInsertMacro {
  id: string;
  /** Natural-language button text, e.g. "Bold text". */
  label: string;
  category: "solutions" | "scoring" | "formatting" | "generic";
  /** Natural-language explanation, shown in the tooltip body. */
  description: string;
  /** Literal LaTeX skeleton, shown as a code preview in the tooltip. */
  preview: string;
  args: QuickInsertArg[];
  buildTemplate: (args: string[]) => QuickInsertTemplate;
  /**
   * Which argument receives a wrapped selection (default 0). Macros whose
   * meaningful "content" argument isn't the first one — e.g. \textcolor's
   * text comes after the color — set this so a selection lands where a
   * user would expect, instead of overwriting an unrelated argument.
   */
  selectionArgIndex?: number;
}

/**
 * Interleaves literalParts and args (literalParts.length === args.length + 1)
 * into one string, tracking each arg's [from,to) span in the result so
 * callers don't have to search for placeholder text (which may recur
 * elsewhere in the template, e.g. "text" inside "\textbf").
 */
export function templateJoin(literalParts: string[], args: string[]): QuickInsertTemplate {
  let text = "";
  const argOffsets: ArgOffset[] = [];
  for (let i = 0; i < args.length; i++) {
    text += literalParts[i];
    const from = text.length;
    text += args[i];
    argOffsets.push({ from, to: text.length });
  }
  text += literalParts[literalParts.length - 1];
  return { text, argOffsets };
}

export const QUICK_INSERT_MACROS: QuickInsertMacro[] = [
  // --- solutions (Loesung.sty) ---
  {
    id: "loesung",
    label: "Solution text",
    category: "solutions",
    description: "Shown only in the answer key.",
    preview: "\\Loesung{text}",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["\\Loesung{", "}"], a)
  },
  {
    id: "loesung-replace",
    label: "Replace in answer key",
    category: "solutions",
    description: "Different content in the answer key vs. the student copy.",
    preview: "\\LoesungReplace{solution}{blankContent}",
    args: [{ placeholder: "solution" }, { placeholder: "blankContent" }],
    buildTemplate: (a) => templateJoin(["\\LoesungReplace{", "}{", "}"], a)
  },
  {
    id: "loesung-leer",
    label: "Blank space",
    category: "solutions",
    description: "Solution vs. blank vertical space.",
    preview: "\\LoesungLeer{solution}{blankHeight}",
    args: [{ placeholder: "solution" }, { placeholder: "2cm" }],
    buildTemplate: (a) => templateJoin(["\\LoesungLeer{", "}{", "}"], a)
  },
  {
    id: "loesung-img",
    label: "Solution image",
    category: "solutions",
    description: "Different image in the answer key vs. the student copy.",
    preview: "\\LoesungImg{solutionImg}{blankImg}{width}",
    args: [{ placeholder: "solutionImg" }, { placeholder: "blankImg" }, { placeholder: "5cm" }],
    buildTemplate: (a) => templateJoin(["\\LoesungImg{", "}{", "}{", "}"], a)
  },
  {
    id: "loesung-luecke",
    label: "Fill-in blank",
    category: "solutions",
    description: "Solution vs. a ruled line to fill in.",
    preview: "\\LoesungLuecke{solution}{width}",
    args: [{ placeholder: "solution" }, { placeholder: "3cm" }],
    buildTemplate: (a) => templateJoin(["\\LoesungLuecke{", "}{", "}"], a)
  },
  {
    id: "loesung-karo",
    label: "Graph paper",
    category: "solutions",
    description: "Solution vs. rows of graph-paper squares.",
    preview: "\\LoesungKaro{solution}{n}",
    args: [{ placeholder: "solution" }, { placeholder: "3" }],
    buildTemplate: (a) => templateJoin(["\\LoesungKaro{", "}{", "}"], a)
  },
  {
    id: "loesung-line",
    label: "Ruled lines",
    category: "solutions",
    description: "Solution vs. ruled writing lines.",
    preview: "\\LoesungLine{solution}{n}",
    args: [{ placeholder: "solution" }, { placeholder: "3" }],
    buildTemplate: (a) => templateJoin(["\\LoesungLine{", "}{", "}"], a)
  },
  {
    id: "loesung-form",
    label: "Fillable field",
    category: "solutions",
    description: "A fillable PDF form text field.",
    preview: "\\LoesungForm{width}{multiline}",
    args: [{ placeholder: "5cm" }, { placeholder: "false" }],
    buildTemplate: (a) => templateJoin(["\\LoesungForm{", "}{", "}"], a)
  },
  {
    id: "kariert",
    label: "Graph paper (raw)",
    category: "solutions",
    description: "Rows of graph-paper squares, without an answer-key toggle.",
    preview: "\\kariert[cellSize]{rows}",
    args: [{ placeholder: "0.5cm", optional: true }, { placeholder: "3" }],
    buildTemplate: (a) => templateJoin(["\\kariert[", "]{", "}"], a),
    selectionArgIndex: 1
  },
  {
    id: "liniert",
    label: "Ruled lines (raw)",
    category: "solutions",
    description: "Ruled writing lines, without an answer-key toggle.",
    preview: "\\liniert[lineHeight]{n}",
    args: [{ placeholder: "0.8cm", optional: true }, { placeholder: "3" }],
    buildTemplate: (a) => templateJoin(["\\liniert[", "]{", "}"], a),
    selectionArgIndex: 1
  },

  // --- scoring (Schulaufgabe.sty) ---
  {
    id: "be",
    label: "Full point",
    category: "scoring",
    description: "Award 1 point.",
    preview: "\\BE",
    args: [],
    buildTemplate: () => ({ text: "\\BE", argOffsets: [] })
  },
  {
    id: "hbe",
    label: "Half point",
    category: "scoring",
    description: "Award 0.5 points.",
    preview: "\\hBE",
    args: [],
    buildTemplate: () => ({ text: "\\hBE", argOffsets: [] })
  },
  {
    id: "qbe",
    label: "Quarter point",
    category: "scoring",
    description: "Award 0.25 points.",
    preview: "\\qBE",
    args: [],
    buildTemplate: () => ({ text: "\\qBE", argOffsets: [] })
  },

  // --- formatting ---
  {
    id: "textbf",
    label: "Bold text",
    category: "formatting",
    description: "Bold text.",
    preview: "\\textbf{text}",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["\\textbf{", "}"], a)
  },
  {
    id: "textit",
    label: "Italic text",
    category: "formatting",
    description: "Italic text.",
    preview: "\\textit{text}",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["\\textit{", "}"], a)
  },
  {
    id: "textcolor",
    label: "Colored text",
    category: "formatting",
    description: "Colored text — edit the color name or hex code.",
    preview: "\\textcolor{color}{text}",
    args: [{ placeholder: "red" }, { placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["\\textcolor{", "}{", "}"], a),
    selectionArgIndex: 1
  },
  {
    id: "fontsize-footnotesize",
    label: "Small text",
    category: "formatting",
    description: "Footnote-sized text.",
    preview: "{\\footnotesize text}",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["{\\footnotesize ", "}"], a)
  },
  {
    id: "fontsize-large",
    label: "Slightly larger text",
    category: "formatting",
    description: "Slightly larger text.",
    preview: "{\\large text}",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["{\\large ", "}"], a)
  },
  {
    id: "fontsize-Large",
    label: "Larger text",
    category: "formatting",
    description: "Larger text.",
    preview: "{\\Large text}",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["{\\Large ", "}"], a)
  },
  {
    id: "fontsize-LARGE",
    label: "Large heading text",
    category: "formatting",
    description: "Large heading-sized text.",
    preview: "{\\LARGE text}",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["{\\LARGE ", "}"], a)
  },
  {
    id: "fontsize-huge",
    label: "Huge text",
    category: "formatting",
    description: "Huge text.",
    preview: "{\\huge text}",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["{\\huge ", "}"], a)
  },

  // --- generic LaTeX ---
  {
    id: "includegraphics",
    label: "Image",
    category: "generic",
    description: "Insert an image.",
    preview: "\\includegraphics[width=]{path}",
    args: [{ placeholder: "8cm", optional: true }, { placeholder: "image.png" }],
    buildTemplate: (a) => templateJoin(["\\includegraphics[width=", "]{", "}"], a),
    selectionArgIndex: 1
  },
  {
    id: "tabular",
    label: "Table",
    category: "generic",
    description: "A simple table.",
    preview: "\\begin{tabular}{ll}...\\end{tabular}",
    args: [{ placeholder: "ll" }],
    buildTemplate: (a) =>
      templateJoin(
        ["\\begin{tabular}{", "}\n  a & b \\\\\n  c & d \\\\\n\\end{tabular}"],
        a
      )
  },
  {
    id: "itemize",
    label: "Bullet list",
    category: "generic",
    description: "A bullet list.",
    preview: "\\begin{itemize}...\\end{itemize}",
    args: [{ placeholder: "item" }],
    buildTemplate: (a) => templateJoin(["\\begin{itemize}\n  \\item ", "\n  \\item item\n\\end{itemize}"], a)
  },
  {
    id: "enumerate",
    label: "Numbered list",
    category: "generic",
    description: "A numbered list.",
    preview: "\\begin{enumerate}...\\end{enumerate}",
    args: [{ placeholder: "item" }],
    buildTemplate: (a) => templateJoin(["\\begin{enumerate}\n  \\item ", "\n  \\item item\n\\end{enumerate}"], a)
  },
  {
    id: "inline-math",
    label: "Inline math",
    category: "generic",
    description: "Inline math.",
    preview: "$...$",
    args: [{ placeholder: "x" }],
    buildTemplate: (a) => templateJoin(["$", "$"], a)
  },
  {
    id: "center",
    label: "Centered content",
    category: "generic",
    description: "Centered content.",
    preview: "\\begin{center}...\\end{center}",
    args: [{ placeholder: "content" }],
    buildTemplate: (a) => templateJoin(["\\begin{center}\n  ", "\n\\end{center}"], a)
  }
];
