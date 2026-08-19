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

/**
 * Palette entry for the LaTeX quick-insert bar. The visible button text and
 * tooltip live in the i18n catalogs under `editor.macros.<id>`, keyed by `id`,
 * so they can be translated without touching this table.
 */
export interface QuickInsertMacro {
  id: string;
  category: "solutions" | "scoring" | "formatting" | "generic";
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
    category: "solutions",
    preview: "\\Loesung{text}",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["\\Loesung{", "}"], a)
  },
  {
    id: "loesung-replace",
    category: "solutions",
    preview: "\\LoesungReplace{solution}{blankContent}",
    args: [{ placeholder: "solution" }, { placeholder: "blankContent" }],
    buildTemplate: (a) => templateJoin(["\\LoesungReplace{", "}{", "}"], a)
  },
  {
    id: "loesung-leer",
    category: "solutions",
    preview: "\\LoesungLeer{solution}{blankHeight}",
    args: [{ placeholder: "solution" }, { placeholder: "2cm" }],
    buildTemplate: (a) => templateJoin(["\\LoesungLeer{", "}{", "}"], a)
  },
  {
    id: "loesung-img",
    category: "solutions",
    preview: "\\LoesungImg{solutionImg}{blankImg}{width}",
    args: [{ placeholder: "solutionImg" }, { placeholder: "blankImg" }, { placeholder: "5cm" }],
    buildTemplate: (a) => templateJoin(["\\LoesungImg{", "}{", "}{", "}"], a)
  },
  {
    id: "loesung-luecke",
    category: "solutions",
    preview: "\\LoesungLuecke{solution}{width}",
    args: [{ placeholder: "solution" }, { placeholder: "3cm" }],
    buildTemplate: (a) => templateJoin(["\\LoesungLuecke{", "}{", "}"], a)
  },
  {
    id: "loesung-karo",
    category: "solutions",
    preview: "\\LoesungKaro{solution}{n}",
    args: [{ placeholder: "solution" }, { placeholder: "3" }],
    buildTemplate: (a) => templateJoin(["\\LoesungKaro{", "}{", "}"], a)
  },
  {
    id: "loesung-line",
    category: "solutions",
    preview: "\\LoesungLine{solution}{n}",
    args: [{ placeholder: "solution" }, { placeholder: "3" }],
    buildTemplate: (a) => templateJoin(["\\LoesungLine{", "}{", "}"], a)
  },
  {
    id: "loesung-form",
    category: "solutions",
    preview: "\\LoesungForm{width}{multiline}",
    args: [{ placeholder: "5cm" }, { placeholder: "false" }],
    buildTemplate: (a) => templateJoin(["\\LoesungForm{", "}{", "}"], a)
  },
  {
    id: "kariert",
    category: "solutions",
    preview: "\\kariert[cellSize]{rows}",
    args: [{ placeholder: "0.5cm", optional: true }, { placeholder: "3" }],
    buildTemplate: (a) => templateJoin(["\\kariert[", "]{", "}"], a),
    selectionArgIndex: 1
  },
  {
    id: "liniert",
    category: "solutions",
    preview: "\\liniert[lineHeight]{n}",
    args: [{ placeholder: "0.8cm", optional: true }, { placeholder: "3" }],
    buildTemplate: (a) => templateJoin(["\\liniert[", "]{", "}"], a),
    selectionArgIndex: 1
  },

  // --- scoring (Schulaufgabe.sty) ---
  {
    id: "be",
    category: "scoring",
    preview: "\\BE",
    args: [],
    buildTemplate: () => ({ text: "\\BE", argOffsets: [] })
  },
  {
    id: "hbe",
    category: "scoring",
    preview: "\\hBE",
    args: [],
    buildTemplate: () => ({ text: "\\hBE", argOffsets: [] })
  },
  {
    id: "qbe",
    category: "scoring",
    preview: "\\qBE",
    args: [],
    buildTemplate: () => ({ text: "\\qBE", argOffsets: [] })
  },

  // --- formatting ---
  {
    id: "textbf",
    category: "formatting",
    preview: "\\textbf{text}",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["\\textbf{", "}"], a)
  },
  {
    id: "textit",
    category: "formatting",
    preview: "\\textit{text}",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["\\textit{", "}"], a)
  },
  {
    id: "textcolor",
    category: "formatting",
    preview: "\\textcolor{color}{text}",
    args: [{ placeholder: "red" }, { placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["\\textcolor{", "}{", "}"], a),
    selectionArgIndex: 1
  },
  {
    id: "fontsize-footnotesize",
    category: "formatting",
    preview: "{\\footnotesize text}",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["{\\footnotesize ", "}"], a)
  },
  {
    id: "fontsize-large",
    category: "formatting",
    preview: "{\\large text}",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["{\\large ", "}"], a)
  },
  {
    id: "fontsize-Large",
    category: "formatting",
    preview: "{\\Large text}",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["{\\Large ", "}"], a)
  },
  {
    id: "fontsize-LARGE",
    category: "formatting",
    preview: "{\\LARGE text}",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["{\\LARGE ", "}"], a)
  },
  {
    id: "fontsize-huge",
    category: "formatting",
    preview: "{\\huge text}",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["{\\huge ", "}"], a)
  },

  // --- generic LaTeX ---
  {
    id: "includegraphics",
    category: "generic",
    preview: "\\includegraphics[width=]{path}",
    args: [{ placeholder: "8cm", optional: true }, { placeholder: "image.png" }],
    buildTemplate: (a) => templateJoin(["\\includegraphics[width=", "]{", "}"], a),
    selectionArgIndex: 1
  },
  {
    id: "tabular",
    category: "generic",
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
    category: "generic",
    preview: "\\begin{itemize}...\\end{itemize}",
    args: [{ placeholder: "item" }],
    buildTemplate: (a) => templateJoin(["\\begin{itemize}\n  \\item ", "\n  \\item item\n\\end{itemize}"], a)
  },
  {
    id: "enumerate",
    category: "generic",
    preview: "\\begin{enumerate}...\\end{enumerate}",
    args: [{ placeholder: "item" }],
    buildTemplate: (a) => templateJoin(["\\begin{enumerate}\n  \\item ", "\n  \\item item\n\\end{enumerate}"], a)
  },
  {
    id: "inline-math",
    category: "generic",
    preview: "$...$",
    args: [{ placeholder: "x" }],
    buildTemplate: (a) => templateJoin(["$", "$"], a)
  },
  {
    id: "center",
    category: "generic",
    preview: "\\begin{center}...\\end{center}",
    args: [{ placeholder: "content" }],
    buildTemplate: (a) => templateJoin(["\\begin{center}\n  ", "\n\\end{center}"], a)
  }
];
