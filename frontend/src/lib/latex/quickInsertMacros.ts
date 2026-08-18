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
  label: string;
  category: "solutions" | "scoring" | "generic";
  description: string;
  args: QuickInsertArg[];
  buildTemplate: (args: string[]) => QuickInsertTemplate;
  warnConflictsWithStructuredEditor?: boolean;
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
    label: "\\Loesung",
    category: "solutions",
    description: "\\Loesung{text} — shown only in the answer key",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["\\Loesung{", "}"], a)
  },
  {
    id: "loesung-replace",
    label: "\\LoesungReplace",
    category: "solutions",
    description: "\\LoesungReplace{solution}{blankContent} — different content in answer key vs. student copy",
    args: [{ placeholder: "solution" }, { placeholder: "blankContent" }],
    buildTemplate: (a) => templateJoin(["\\LoesungReplace{", "}{", "}"], a)
  },
  {
    id: "loesung-leer",
    label: "\\LoesungLeer",
    category: "solutions",
    description: "\\LoesungLeer{solution}{blankHeight} — solution vs. blank vertical space",
    args: [{ placeholder: "solution" }, { placeholder: "2cm" }],
    buildTemplate: (a) => templateJoin(["\\LoesungLeer{", "}{", "}"], a)
  },
  {
    id: "loesung-img",
    label: "\\LoesungImg",
    category: "solutions",
    description: "\\LoesungImg{solutionImg}{blankImg}{width} — different image in answer key vs. student copy",
    args: [{ placeholder: "solutionImg" }, { placeholder: "blankImg" }, { placeholder: "5cm" }],
    buildTemplate: (a) => templateJoin(["\\LoesungImg{", "}{", "}{", "}"], a)
  },
  {
    id: "loesung-luecke",
    label: "\\LoesungLuecke",
    category: "solutions",
    description: "\\LoesungLuecke{solution}{width} — fill-in-the-blank: solution vs. a ruled line",
    args: [{ placeholder: "solution" }, { placeholder: "3cm" }],
    buildTemplate: (a) => templateJoin(["\\LoesungLuecke{", "}{", "}"], a)
  },
  {
    id: "loesung-karo",
    label: "\\LoesungKaro",
    category: "solutions",
    description: "\\LoesungKaro{solution}{n} — solution vs. n rows of graph-paper squares",
    args: [{ placeholder: "solution" }, { placeholder: "3" }],
    buildTemplate: (a) => templateJoin(["\\LoesungKaro{", "}{", "}"], a)
  },
  {
    id: "loesung-line",
    label: "\\LoesungLine",
    category: "solutions",
    description: "\\LoesungLine{solution}{n} — solution vs. n ruled writing lines",
    args: [{ placeholder: "solution" }, { placeholder: "3" }],
    buildTemplate: (a) => templateJoin(["\\LoesungLine{", "}{", "}"], a)
  },
  {
    id: "loesung-form",
    label: "\\LoesungForm",
    category: "solutions",
    description: "\\LoesungForm{width}{multiline} — fillable PDF form text field",
    args: [{ placeholder: "5cm" }, { placeholder: "false" }],
    buildTemplate: (a) => templateJoin(["\\LoesungForm{", "}{", "}"], a)
  },
  {
    id: "kariert",
    label: "\\kariert",
    category: "solutions",
    description: "\\kariert[cellSize]{rows} — graph-paper squares",
    args: [{ placeholder: "0.5cm", optional: true }, { placeholder: "3" }],
    buildTemplate: (a) => templateJoin(["\\kariert[", "]{", "}"], a)
  },
  {
    id: "liniert",
    label: "\\liniert",
    category: "solutions",
    description: "\\liniert[lineHeight]{n} — n ruled writing lines",
    args: [{ placeholder: "0.8cm", optional: true }, { placeholder: "3" }],
    buildTemplate: (a) => templateJoin(["\\liniert[", "]{", "}"], a)
  },
  {
    id: "loesung-multi",
    label: "\\LoesungMulti",
    category: "solutions",
    description: "\\LoesungMulti[cols]{...} — multi-column option list (used by MC exercises)",
    args: [{ placeholder: "2" }],
    buildTemplate: (a) =>
      templateJoin(["\\LoesungMulti[", "]{\n  \\multi{option}\n  \\Lmulti{option}\n}"], a),
    warnConflictsWithStructuredEditor: true
  },
  {
    id: "multi",
    label: "\\multi",
    category: "solutions",
    description: "\\multi{text} — a wrong MC option",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["\\multi{", "}"], a),
    warnConflictsWithStructuredEditor: true
  },
  {
    id: "lmulti",
    label: "\\Lmulti",
    category: "solutions",
    description: "\\Lmulti{text} — a correct MC option",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["\\Lmulti{", "}"], a),
    warnConflictsWithStructuredEditor: true
  },

  // --- scoring (Schulaufgabe.sty) ---
  {
    id: "be",
    label: "\\BE",
    category: "scoring",
    description: "\\BE — award 1 point",
    args: [],
    buildTemplate: () => ({ text: "\\BE", argOffsets: [] })
  },
  {
    id: "hbe",
    label: "\\hBE",
    category: "scoring",
    description: "\\hBE — award 0.5 points",
    args: [],
    buildTemplate: () => ({ text: "\\hBE", argOffsets: [] })
  },
  {
    id: "qbe",
    label: "\\qBE",
    category: "scoring",
    description: "\\qBE — award 0.25 points",
    args: [],
    buildTemplate: () => ({ text: "\\qBE", argOffsets: [] })
  },

  // --- generic LaTeX ---
  {
    id: "includegraphics",
    label: "\\includegraphics",
    category: "generic",
    description: "\\includegraphics[width=]{path} — insert an image",
    args: [{ placeholder: "8cm", optional: true }, { placeholder: "image.png" }],
    buildTemplate: (a) => templateJoin(["\\includegraphics[width=", "]{", "}"], a)
  },
  {
    id: "tabular",
    label: "tabular",
    category: "generic",
    description: "\\begin{tabular}{ll}...\\end{tabular} — a simple table",
    args: [{ placeholder: "ll" }],
    buildTemplate: (a) =>
      templateJoin(
        ["\\begin{tabular}{", "}\n  a & b \\\\\n  c & d \\\\\n\\end{tabular}"],
        a
      )
  },
  {
    id: "itemize",
    label: "itemize",
    category: "generic",
    description: "\\begin{itemize}...\\end{itemize} — a bullet list",
    args: [{ placeholder: "item" }],
    buildTemplate: (a) => templateJoin(["\\begin{itemize}\n  \\item ", "\n  \\item item\n\\end{itemize}"], a)
  },
  {
    id: "enumerate",
    label: "enumerate",
    category: "generic",
    description: "\\begin{enumerate}...\\end{enumerate} — a numbered list",
    args: [{ placeholder: "item" }],
    buildTemplate: (a) => templateJoin(["\\begin{enumerate}\n  \\item ", "\n  \\item item\n\\end{enumerate}"], a)
  },
  {
    id: "textbf",
    label: "\\textbf",
    category: "generic",
    description: "\\textbf{text} — bold text",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["\\textbf{", "}"], a)
  },
  {
    id: "textit",
    label: "\\textit",
    category: "generic",
    description: "\\textit{text} — italic text",
    args: [{ placeholder: "text" }],
    buildTemplate: (a) => templateJoin(["\\textit{", "}"], a)
  },
  {
    id: "inline-math",
    label: "$...$",
    category: "generic",
    description: "$...$ — inline math",
    args: [{ placeholder: "x" }],
    buildTemplate: (a) => templateJoin(["$", "$"], a)
  },
  {
    id: "center",
    label: "center",
    category: "generic",
    description: "\\begin{center}...\\end{center} — centered content",
    args: [{ placeholder: "content" }],
    buildTemplate: (a) => templateJoin(["\\begin{center}\n  ", "\n\\end{center}"], a)
  }
];
