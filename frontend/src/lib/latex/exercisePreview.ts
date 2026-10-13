import { compileWithCache } from "#lib/latex/compileCache";
import type { CompileResult } from "#lib/latex/compiler";
import { formatExerciseLatex } from "#lib/latex/scoreParser";
import { exerciseResourceRepository } from "#lib/repositories/exerciseResourceRepository";

const getPreamble = (extraOpts: string) => `\\documentclass[a4paper]{article}
\\usepackage[${extraOpts}]{sty/Schulaufgabe}
\\usepackage{bbding}
\\usepackage{pifont}
\\usepackage{fontspec}
\\usepackage{framed}
\\usepackage{enumitem}
\\usetikzlibrary{shapes.geometric, arrows}
\\usepackage{sty/tikz-uml}
\\neverindent
\\WarningsOff
\\renewcommand{\\Namenszeile}{}
\\AtBeginDocument{
  \\pagestyle{empty}
  \\thispagestyle{empty}
  \\lhead{}
  \\chead{}
  \\rhead{}
  \\lfoot{}
  \\cfoot{}
  \\rfoot{}
}`;

/** One standalone XeLaTeX document around already-wrapped exercise LaTeX (preview, PDFs, group export). */
export function buildExerciseDocument(
  content: string,
  { solution, extraPreamble = "" }: { solution: boolean; extraPreamble?: string }
): string {
  const preamble = getPreamble(solution ? "sans,antworten" : "sans");
  const extra = extraPreamble ? `${extraPreamble}\n` : "";
  return `${preamble}\n\\setboolean{Antworten}{${solution}}\n${extra}\\begin{document}\n\\leavevmode\\par\n${content}\n\\end{document}`;
}

const SLOT = "\u0001";

/** Wraps `reference` (e.g. `\input{...}`) exactly as `formatExerciseLatex` would wrap `body`. */
export function wrapExerciseReference(body: string, name: string, reference: string): string {
  const wrapped = formatExerciseLatex(body + SLOT, name);
  const slot = wrapped.indexOf(SLOT);
  return wrapped.slice(0, slot - body.length) + reference + wrapped.slice(slot + 1);
}

export interface ExercisePreviewInput {
  /** Compile-cache slot id (exercise id, or the editor's staging id when unsaved). */
  cacheId: string;
  name: string;
  latexBody: string;
  /** Whose resource files to attach; `staged` ones are inlined. */
  resourceOwnerId: string;
  staged: boolean;
  useLocal: boolean;
  key: CryptoKey | null;
  onStatus?: (status: string) => void;
  /** Called as soon as the Angabe is ready, before the Lösung compile starts. */
  onAngabe?: (angabe: CompileResult) => void;
  /** Awaited before each compile (the export paces server compiles with it). */
  beforeCompile?: () => Promise<void>;
}

export interface ExercisePreviewResult {
  angabe: CompileResult;
  loesung: CompileResult;
  missingGraphics: string[];
}

/** Compiles the Angabe and Lösung PDFs of a single exercise into the compile cache. */
export async function compileExercisePreview(input: ExercisePreviewInput): Promise<ExercisePreviewResult> {
  const name = input.name || "Aufgabe";
  const body = formatExerciseLatex(input.latexBody, name);
  const angabeTex = buildExerciseDocument(body, { solution: false });
  const loesungTex = buildExerciseDocument(body, { solution: true });

  // Staged files are inlined: they may not exist on the server yet.
  const collected = await exerciseResourceRepository.collectForCompile(
    [{ id: input.resourceOwnerId, label: name, staged: input.staged }],
    input.key,
    input.staged || input.useLocal
  );
  const opts = { resources: collected.inline, resourceExerciseIds: collected.exerciseIds };

  await input.beforeCompile?.();
  const angabe = await compileWithCache(
    { kind: "exercise", id: input.cacheId, variant: "angabe" },
    angabeTex, input.useLocal, input.onStatus, false, opts
  );
  input.onAngabe?.(angabe);
  await input.beforeCompile?.();
  const loesung = await compileWithCache(
    { kind: "exercise", id: input.cacheId, variant: "loesung" },
    loesungTex, input.useLocal, undefined, false, opts
  );
  return {
    angabe,
    loesung,
    missingGraphics: [...(angabe.missingGraphics ?? []), ...(loesung.missingGraphics ?? [])],
  };
}
