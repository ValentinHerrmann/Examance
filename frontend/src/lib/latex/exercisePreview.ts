import { compileWithCache } from "$lib/latex/compileCache";
import type { CompileResult } from "$lib/latex/compiler";
import { formatExerciseLatex } from "$lib/latex/scoreParser";
import { exerciseResourceRepository } from "$lib/repositories/exerciseResourceRepository";

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
  const angabeTex = `${getPreamble("sans")}\n\\setboolean{Antworten}{false}\n\\begin{document}\n\\leavevmode\\par\n${body}\n\\end{document}`;
  const loesungTex = `${getPreamble("sans,antworten")}\n\\setboolean{Antworten}{true}\n\\begin{document}\n\\leavevmode\\par\n${body}\n\\end{document}`;

  // Staged files are inlined: they may not exist on the server yet.
  const collected = await exerciseResourceRepository.collectForCompile(
    [{ id: input.resourceOwnerId, label: name, staged: input.staged }],
    input.key,
    input.staged || input.useLocal
  );
  const opts = { resources: collected.inline, resourceExerciseIds: collected.exerciseIds };

  const angabe = await compileWithCache(
    { kind: "exercise", id: input.cacheId, variant: "angabe" },
    angabeTex, input.useLocal, input.onStatus, false, opts
  );
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
