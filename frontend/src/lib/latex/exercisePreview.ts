import { compileWithCache } from "#lib/latex/compileCache";
import type { CompileResult } from "#lib/latex/compiler";
import { formatExerciseLatex } from "#lib/latex/scoreParser";
import { exerciseResourceRepository } from "#lib/repositories/exerciseResourceRepository";
import { documentBody, documentLayers, withPackages, type LatexPackageEntry } from "#lib/latex/packages";
import { getAccountPackages } from "#lib/latex/packageSettings";

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

export interface ExerciseDocumentOptions {
  solution: boolean;
  /** The account's package list (`getAccountPackages()`), merged with the exercises' own. */
  accountPackages: readonly LatexPackageEntry[];
  extraPreamble?: string;
  /** The exercise bodies when `content` only `\input`s them, so their package lines still count. */
  packageSource?: string;
}

/** One standalone XeLaTeX document around already-wrapped exercise LaTeX (preview, PDFs, group export). */
export function buildExerciseDocument(
  content: string,
  { solution, accountPackages, extraPreamble = "", packageSource }: ExerciseDocumentOptions
): string {
  const preamble = getPreamble(solution ? "sans,antworten" : "sans");
  const extra = extraPreamble ? `${extraPreamble}\n` : "";
  const doc = `${preamble}\n\\setboolean{Antworten}{${solution}}\n${extra}\\begin{document}\n\\leavevmode\\par\n${content}\n\\end{document}`;
  return withPackages(doc, documentLayers(accountPackages, packageSource ?? documentBody(doc)));
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

/** Both standalone documents of one exercise (preview compile, layout reports). */
export async function prepareExerciseSources(
  rawName: string,
  latexBody: string
): Promise<{ name: string; angabeTex: string; loesungTex: string }> {
  const name = rawName || "Aufgabe";
  const body = formatExerciseLatex(latexBody, name);
  const accountPackages = await getAccountPackages();
  return {
    name,
    angabeTex: buildExerciseDocument(body, { solution: false, accountPackages }),
    loesungTex: buildExerciseDocument(body, { solution: true, accountPackages }),
  };
}

/** Compiles the Angabe and Lösung PDFs of a single exercise into the compile cache. */
export async function compileExercisePreview(input: ExercisePreviewInput): Promise<ExercisePreviewResult> {
  const { name, angabeTex, loesungTex } = await prepareExerciseSources(input.name, input.latexBody);

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
