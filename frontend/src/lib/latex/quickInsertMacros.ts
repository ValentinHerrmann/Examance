/**
 * Catalog of LaTeX snippets for the quick-insert toolbar in LatexEditor.svelte: answer-key macros
 * (Loesung.sty), scoring macros (Schulaufgabe.sty) and generic constructs; subject snippets live in subjectSnippets.ts.
 * Metadata the editor sets through its UI (AFB, competencies, fixed scores) has no snippet; the macros still work.
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

export const GENERAL_CATEGORIES = ["solutions", "scoring", "formatting", "generic"] as const;
/** Shown one at a time, chosen in the palette's subject select. */
export const SUBJECT_CATEGORIES = ["math", "cs", "physics", "chemistry", "biology", "humanities"] as const;
export type GeneralCategory = (typeof GENERAL_CATEGORIES)[number];
export type SubjectCategory = (typeof SUBJECT_CATEGORIES)[number];

/**
 * Palette entry for the LaTeX quick-insert bar. The visible button text and
 * tooltip live in the i18n catalogs under `editor.macros.<id>`, keyed by `id`,
 * so they can be translated without touching this table.
 */
export interface QuickInsertMacro {
  id: string;
  category: GeneralCategory | SubjectCategory;
  /** Literal LaTeX skeleton, shown as a code preview in the tooltip. */
  preview: string;
  args: QuickInsertArg[];
  buildTemplate: (args: string[]) => QuickInsertTemplate;
    /** Argument that receives a wrapped selection (default 0); set where the content argument isn't first, e.g. \textcolor. */
  selectionArgIndex?: number;
}

/**
 * Interleaves literalParts and args (literalParts.length === args.length + 1) into one string and
 * tracks each arg's [from,to) span, so callers needn't search for placeholder text that may recur.
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

/** Entry wrapping one argument: `${before}${placeholder}${after}`. */
export function oneArgMacro(
  id: string,
  before: string,
  placeholder: string,
  after = "}",
  category: QuickInsertMacro["category"] = "scoring"
): QuickInsertMacro {
  return {
    id,
    category,
    preview: `${before}${placeholder}${after}`,
    args: [{ placeholder }],
    buildTemplate: (a) => templateJoin([before, after], a)
  };
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
  oneArgMacro("teilaufgabe", String.raw`\begin{Teilaufgabe}{`, "Teilaufgabe", "}\n\n" + String.raw`\end{Teilaufgabe}`),

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
  },
  {
    id: "seitenumbruch",
    category: "generic",
    preview: "\\Seitenumbruch",
    args: [],
    buildTemplate: () => ({ text: "\\Seitenumbruch\n", argOffsets: [] })
  }
];
