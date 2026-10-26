/**
 * Catalog of LaTeX snippets for the quick-insert toolbar in LatexEditor.svelte: answer-key macros
 * (Loesung.sty), scoring macros (Schulaufgabe.sty), generic constructs and subject snippets (packages.sty).
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
export const SUBJECT_CATEGORIES = ["math", "cs", "science"] as const;
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
function oneArgMacro(
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
  },

  // --- subjects: math ---
  oneArgMacro("math-pythagoras", "$", "a^2 + b^2 = c^2", "$", "math"),
  oneArgMacro("math-fraction", String.raw`$\frac{`, "a", "}{b}$", "math"),
  oneArgMacro("math-root", String.raw`$\sqrt{`, "x", "}$", "math"),
  oneArgMacro(
    "math-system",
    String.raw`\begin{align*}
  `,
    "2x + 3y &= 7",
    String.raw` \\
  x - y &= 1
\end{align*}`,
    "math"
  ),
  oneArgMacro("math-cases", String.raw`$f(x) = \begin{cases} `, String.raw`x^2 & x \geq 0 \\ -x & x < 0`, String.raw` \end{cases}$`, "math"),
  oneArgMacro("math-matrix", String.raw`$\begin{pmatrix} `, String.raw`1 & 2 \\ 3 & 4`, String.raw` \end{pmatrix}$`, "math"),
  oneArgMacro("math-integral", String.raw`$\int_{a}^{b} `, "f(x)", String.raw`\,\mathrm{d}x$`, "math"),
  oneArgMacro("math-sum", String.raw`$\sum_{i=1}^{n} `, "i", "$", "math"),
  oneArgMacro(
    "math-plot",
    String.raw`\begin{tikzpicture}[scale=0.8]
  \draw[->] (-3,0) -- (3,0) node[right] {$x$};
  \draw[->] (0,-1) -- (0,4) node[above] {$y$};
  \draw[thick, domain=-2:2, samples=50] plot (\x, {`,
    String.raw`\x*\x`,
    String.raw`});
\end{tikzpicture}`,
    "math"
  ),
  oneArgMacro(
    "math-numberline",
    String.raw`\begin{tikzpicture}
  \draw[->] (-0.5,0) -- (`,
    "10.5",
    String.raw`,0);
  \foreach \x in {0,...,10} \draw (\x,0.1) -- (\x,-0.1) node[below] {\x};
\end{tikzpicture}`,
    "math"
  ),
  oneArgMacro(
    "math-valuetable",
    String.raw`\begin{tabular}{|c|c|c|c|c|}
  \hline
  $x$ & `,
    "0 & 1 & 2 & 3",
    String.raw` \\ \hline
  $f(x)$ & & & & \\ \hline
\end{tabular}`,
    "math"
  ),

  // --- subjects: computer science ---
  oneArgMacro(
    "cs-class-diagram",
    String.raw`\begin{tikzpicture}
  \begin{class}[text width=4cm]{Schule}{0,0}
    \attribute{`,
    "name : String",
    String.raw`}
    \operation{getName() : String}
  \end{class}
  \begin{class}[text width=4cm]{Klasse}{7,0}
    \attribute{bezeichnung : String}
  \end{class}
  \association{Schule}{}{1}{Klasse}{}{*}
\end{tikzpicture}`,
    "cs"
  ),
  oneArgMacro(
    "cs-code",
    String.raw`\begin{lstlisting}[language=`,
    "Python",
    String.raw`, basicstyle=\ttfamily\small]
def summe(n):
    return n * (n + 1) // 2
\end{lstlisting}`,
    "cs"
  ),
  oneArgMacro(
    "cs-struktogramm",
    String.raw`\begin{struktogramm}(90,40)
  \assign{`,
    "i := 0",
    String.raw`}
  \while{i < 10}
    \assign{i := i + 1}
  \whileend
\end{struktogramm}`,
    "cs"
  ),
  oneArgMacro(
    "cs-automaton",
    String.raw`\begin{tikzpicture}[->, >=stealth, node distance=2.5cm, auto]
  \node[state, initial] (q0) {$q_0$};
  \node[state, accepting, right of=q0] (q1) {$q_1$};
  \path (q0) edge node {`,
    "a",
    String.raw`} (q1)
        (q1) edge[loop above] node {b} (q1);
\end{tikzpicture}`,
    "cs"
  ),
  oneArgMacro(
    "cs-er-diagram",
    String.raw`\begin{tikzpicture}[entity/.style={draw, minimum width=2.5cm, minimum height=1cm},
    relation/.style={draw, diamond, aspect=2}]
  \node[entity] (a) {`,
    "Lehrer",
    String.raw`};
  \node[relation, right=1.5cm of a] (r) {unterrichtet};
  \node[entity, right=1.5cm of r] (b) {Klasse};
  \draw (a) -- node[above] {n} (r) -- node[above] {m} (b);
\end{tikzpicture}`,
    "cs"
  ),

  // --- subjects: science and others ---
  oneArgMacro("science-chemical", "", String.raw`H$_2$O`, "", "science"),
  oneArgMacro("science-unit", "$", String.raw`9{,}81`, String.raw`\,\mathrm{m/s^2}$`, "science"),
  oneArgMacro(
    "science-sketch",
    String.raw`\begin{tikzpicture}
  \draw[thick] (0,0) rectangle (3,2);
  \draw[->] (3.5,1) -- (5,1) node[right] {`,
    "Beschriftung",
    String.raw`};
\end{tikzpicture}`,
    "science"
  ),
  oneArgMacro(
    "science-cloze-table",
    String.raw`\begin{tabular}{|l|l|}
  \hline
  `,
    "Begriff",
    String.raw` & \LoesungLuecke{Antwort}{4cm} \\ \hline
  Begriff & \LoesungLuecke{Antwort}{4cm} \\ \hline
\end{tabular}`,
    "science"
  )
];
