import { DEFAULT_EXTRA_NOTES, fillsLastPage, type ExamRecord, type ExerciseRecord, type ExtraNotes } from "#lib/db/schema";
import type { McGroup } from "#lib/db/dbEncryption";
import { compileWithCache, getCachedFor, getLatestForSlot, type CachedCompileEntry } from "#lib/latex/compileCache";
import type { CompileResult } from "#lib/latex/compiler";
import { escapeLatex, formatExerciseLatex, formatMcGroupLatex } from "#lib/latex/scoreParser";
import { printedMcOptions } from "#lib/latex/mcOptions";
import type { ExamItemRef } from "#lib/grading/omrTemplatePrep";
import { exerciseResourceRepository } from "#lib/repositories/exerciseResourceRepository";
import { resolveCompileLogo, type CompileLogo } from "#lib/latex/logo";
import type { LatexResourceFile } from "#lib/latex/resources";
import { effectiveLatexCompilation } from "#lib/stores/capabilities";
import { examCourse } from "#lib/utils/examLabel";
import { documentLayers, withPackages, type LatexPackageEntry } from "#lib/latex/packages";
import { getAccountPackages } from "#lib/latex/packageSettings";
import { translate } from "#lib/i18n";
import { printSettingsOf, type PaperStyle } from "#lib/exam/printLayout";
import { extraSheetCodesLatex, pageCodesLatex } from "#lib/exam/pageCodes";

/** One `\Aufgabe` block of the exam and the exercise ids it scores (several for an MC group); block i is exam position i + 1 (`\thePunkte`). */
export interface ExerciseBlock {
  itemId: string;
  latex: string;
  exerciseIds: string[];
}

/** The LaTeX `\Aufgabe` blocks of an exam in item order (standalone exercises and MC groups). `mcCorrectionHint` prints the correction legend at every MC group and every exercise with answer boxes (issue #192). */
export function buildExerciseBlocks(
  examItems: ExamItemRef[],
  exercises: ExerciseRecord[],
  libraryExercises: ExerciseRecord[],
  mcGroups: McGroup[],
  mcCorrectionHint = false
): ExerciseBlock[] {
  let exerciseCount = 0;
  const blocks: ExerciseBlock[] = [];
  for (const item of examItems) {
    if (item.type === "exercise") {
      const ex = exercises.find((e) => e.id === item.id);
      if (!ex) continue;
      exerciseCount++;
      const title = ex.name || `Aufgabe ${exerciseCount}`;
      const hint = mcCorrectionHint && printedMcOptions(ex.latexBody).length > 0;
      blocks.push({ itemId: item.id, latex: formatExerciseLatex(ex.latexBody, title, ex.id, title, hint), exerciseIds: [ex.id] });
    } else {
      const group = mcGroups.find((g) => g.id === item.id);
      if (!group) continue;
      const members = group.memberIds
        .map((id) => libraryExercises.find((e) => e.id === id) || exercises.find((e) => e.id === id))
        .filter((e): e is ExerciseRecord => Boolean(e));
      const latex = formatMcGroupLatex(
        members.map((m) => ({ id: m.id, latexBody: m.latexBody || "", sourceLabel: m.name || group.title })),
        group.title,
        group.scoringText,
        mcCorrectionHint
      );
      blocks.push({ itemId: item.id, latex, exerciseIds: members.map((m) => m.id) });
    }
  }
  return blocks;
}

/** The blocks of `buildExerciseBlocks` as one string. `pageBreaks` lists item ids that start on a new page; the first emitted block never does. */
export function buildExerciseInputs(
  examItems: ExamItemRef[],
  exercises: ExerciseRecord[],
  libraryExercises: ExerciseRecord[],
  mcGroups: McGroup[],
  pageBreaks?: readonly string[] | null,
  mcCorrectionHint = false
): string {
  const breaks = new Set(pageBreaks ?? []);
  return buildExerciseBlocks(examItems, exercises, libraryExercises, mcGroups, mcCorrectionHint)
    .map((b, i) => (i > 0 && breaks.has(b.itemId) ? `\\newpage\n${b.latex}` : b.latex))
    .join("\n\n");
}

/** Resource files of every exercise in the exam, for the compiler. Files are written flat, so same-name different files conflict; mergeResources() (lib/latex/resources.ts) raises it before compiling. The server engine loads its own rows and only gets exercise ids, unless `needBytes` (local engine, raw export) asks for every file's bytes. */
export async function collectExamResources(
  examItems: ExamItemRef[],
  exercises: ExerciseRecord[],
  libraryExercises: ExerciseRecord[],
  mcGroups: McGroup[],
  sessionKey: CryptoKey | null,
  needBytes = effectiveLatexCompilation() === "local"
) {
  const owners: { id: string; label?: string }[] = [];
  let exerciseCount = 0;
  for (const item of examItems) {
    if (item.type === "exercise") {
      const ex = exercises.find((e) => e.id === item.id);
      if (ex) owners.push({ id: ex.id, label: ex.name || `Aufgabe ${++exerciseCount}` });
    } else {
      const group = mcGroups.find((g) => g.id === item.id);
      for (const memberId of group?.memberIds ?? []) {
        const member =
          libraryExercises.find((e) => e.id === memberId) || exercises.find((e) => e.id === memberId);
        if (member) owners.push({ id: member.id, label: member.name || group?.title });
      }
    }
  }
  return exerciseResourceRepository.collectForCompile(owners, sessionKey, needBytes);
}

/** Full exam document. `options` are the Schulaufgabe.sty options (`sans,punkte[,antworten]`); `accountPackages` is the account's package list (`getAccountPackages()`), merged with the exam's and the exercises' own. The exam's own layout options (`namenszeile`, `schnittecke`) are added here. */
export function buildExamLatex(
  exam: ExamRecord,
  exerciseInputs: string,
  options: string,
  accountPackages: readonly LatexPackageEntry[]
): string {
  const doc = `\\documentclass[a4paper]{article}
\\usepackage[${withExamOptions(options, exam)}]{sty/Schulaufgabe}${pageCodeDefinitions(exam, options)}
\\Info{${exam.infoText || ""}}
\\Fach{${exam.fach || "Informatik"}}
\\Lehrernachname{${exam.lehrernachname || ""}}
\\usepackage{fontspec}
\\usetikzlibrary{shapes.geometric, arrows}
\\usepackage{sty/tikz-uml}
\\neverindent
\\WarningsOff
\\begin{document}
\\Testart{${exam.testart || "Kurzarbeit"}}
\\Klasse{${examCourse(exam)}}
\\Datum{${exam.datum || ""}}
\\Nr{${exam.nr || "1"}}

${exerciseInputs}
${extraNotesLatex(exam.extraNotes)}
\\end{document}`;
  return withPackages(doc, documentLayers(accountPackages, exerciseInputs, exam.latexPackages));
}

/** The closing `\ExamNotes` rest-of-page area (issues #156, #228), or "" when off. */
export function extraNotesLatex(notes: ExtraNotes | null | undefined): string {
  if (!notes || !fillsLastPage(notes)) return "";
  const clamp = (v: number) => (Number.isFinite(v) ? Math.min(25, Math.max(1, v)) : 1);
  const min = clamp(notes.minHeightCm);
  const max = Math.max(min, clamp(notes.maxHeightCm));
  return `\n\\ExamNotes{${escapeLatex(notes.title)}}{${escapeLatex(notes.description ?? "")}}{${min}}{${max}}\n`;
}

type LayoutFields = Pick<ExamRecord, "nameLine" | "pageCodes" | "printLayout" | "paddingPages" | "printMode" | "stickerSpots" | "paperStyle" | "extraPages" | "extraSheets">;

/** The Schulaufgabe.sty option of a writing-paper pattern (issue #228); empty paper sets none. */
const PAPER_OPTION: Record<PaperStyle, string> = { empty: "", squared: "papierkaro", lined: "papierlinien" };

/** Adds the exam's layout switches to the Schulaufgabe.sty options. Each multi-sheet option stands alone and older exams set none, so they compile unchanged (issue #220). */
export function withExamOptions(options: string, layout: LayoutFields): string {
  const print = printSettingsOf(layout);
  const filler = { none: "", blank: "fuellleer", workspace: "fuellplatz" }[print.padding];
  const multiSheet = [print.pageCodes && "seitencode", print.layout === "booklet" && "broschuere", filler, PAPER_OPTION[print.paperStyle]];
  return [options, layout.nameLine && "namenszeile", ...multiSheet].filter(Boolean).join(",");
}

/** The student sheet's page codes (lib/exam/pageCodes.ts) and sticker spots (sticker mode only, `stickerPagesOf`); the solution carries neither. */
function pageCodeDefinitions(exam: ExamRecord, options: string): string {
  if (options.split(",").includes("antworten")) return "";
  const print = printSettingsOf(exam);
  let spots = "";
  if (print.mode === "stickers" && print.stickerSpots !== "cover") spots = print.stickerSpots === "a3" ? "a3" : "bogen";
  // Extra pages carry the writing space's heading and note, also when the rest-of-page area is off.
  const notes = exam.extraNotes ?? DEFAULT_EXTRA_NOTES;
  const extra = print.extraPages > 0 && String.raw`\Zusatzseiten{${print.extraPages}}{${escapeLatex(notes.title)}}{${escapeLatex(notes.description ?? "")}}`;
  return [print.pageCodes && pageCodesLatex(exam.id), spots && String.raw`\Aufkleberseiten{${spots}}`, extra].filter(Boolean).map((line) => `\n${line}`).join("");
}

/** The exam-independent extra sheet (issue #228): one duplex sheet of *paper*, a sticker spot on the front and the code `EXM1:X` on both sides. */
export function extraSheetLatex(paper: PaperStyle): string {
  const options = ["sans", "seitencode", "zusatzblatt", PAPER_OPTION[paper]].filter(Boolean).join(",");
  return `\\documentclass[a4paper]{article}
\\usepackage[${options}]{sty/Schulaufgabe}
${extraSheetCodesLatex()}
\\usepackage{fontspec}
\\begin{document}
\\Zusatzblatt
\\end{document}`;
}

/** Compiles the extra sheet into the compile cache; it has no exam content, so the cache keys on the paper alone. */
export function compileExtraSheet(paper: PaperStyle, onStatus?: (status: string) => void): Promise<CompileResult> {
  const useLocal = effectiveLatexCompilation() === "local";
  return compileWithCache({ kind: "extra-sheet", id: paper, variant: "angabe" }, extraSheetLatex(paper), useLocal, onStatus, false, {});
}

/** What the sheet builders read: the exam's sources and the session key. */
type ExamSourceInput = Pick<ExamPreviewInput, "exam" | "exercises" | "libraryExercises" | "mcGroups" | "examItems" | "key">;

export interface ExamPreviewInput {
  exam: ExamRecord;
  exercises: ExerciseRecord[];
  libraryExercises: ExerciseRecord[];
  mcGroups: McGroup[];
  examItems: ExamItemRef[];
  key: CryptoKey | null;
  onStatus?: (status: string) => void;
  /** Called as soon as the Angabe is ready, before the Lösung compile starts. */
  onAngabe?: (angabe: CompileResult) => void;
  /** False skips the Lösung (the Print step without a solution, issue #220); default true. */
  solution?: boolean;
}

export interface ExamPreviewResult {
  angabe: CompileResult;
  /** Null only when `solution: false` asked to skip it. */
  loesung: CompileResult | null;
  missingGraphics: string[];
}

/** True when the exam contains exercises imported without their code (results-only archive). */
export function examHasWithheldCode(exercises: ExerciseRecord[]): boolean {
  return exercises.some((ex) => ex.codeWithheld);
}

/** Everything a compile of the exam needs: both LaTeX sources, the resource files and the logo. */
export interface ExamSources {
  angabeTex: string;
  loesungTex: string;
  resources: LatexResourceFile[];
  resourceExerciseIds: string[];
  logo: CompileLogo | undefined;
}

/** `needBytes` loads resource and logo bytes (local engine, raw export); otherwise the server resolves them by id. */
export async function prepareExamSources(
  input: ExamSourceInput,
  needBytes: boolean
): Promise<ExamSources> {
  const { exam, exercises, libraryExercises, mcGroups, examItems, key } = input;
  // Results-only imports have no LaTeX: compiling would produce empty exercise blocks.
  if (examHasWithheldCode(exercises)) throw new Error(translate("exam.resultsOnly.noCompile"));
  const inputs = buildExerciseInputs(examItems, exercises, libraryExercises, mcGroups, exam.pageBreaks, exam.mcCorrectionHint);
  const collected = await collectExamResources(examItems, exercises, libraryExercises, mcGroups, key, needBytes);
  const accountPackages = await getAccountPackages();
  return {
    angabeTex: buildExamLatex(exam, inputs, "sans,punkte", accountPackages),
    loesungTex: buildExamLatex(exam, inputs, "sans,punkte,antworten", accountPackages),
    resources: collected.inline,
    resourceExerciseIds: collected.exerciseIds,
    logo: await resolveCompileLogo(exam.id, needBytes),
  };
}

/** Compiles the Angabe and Lösung PDFs of an exam into the compile cache; `solution: false` compiles only the Angabe. */
export function compileExamPreview(input: ExamPreviewInput & { solution?: true }): Promise<ExamPreviewResult & { loesung: CompileResult }>;
export function compileExamPreview(input: ExamPreviewInput): Promise<ExamPreviewResult>;
export async function compileExamPreview(input: ExamPreviewInput): Promise<ExamPreviewResult> {
  const { exam } = input;
  const useLocal = effectiveLatexCompilation() === "local";
  const src = await prepareExamSources(input, useLocal);
  const opts = { resources: src.resources, resourceExerciseIds: src.resourceExerciseIds, logo: src.logo };

  const angabe = await compileWithCache(
    { kind: "exam", id: exam.id, variant: "angabe" },
    src.angabeTex,
    useLocal,
    input.onStatus,
    false,
    opts
  );
  input.onAngabe?.(angabe);
  if (input.solution === false) return { angabe, loesung: null, missingGraphics: angabe.missingGraphics ?? [] };
  const loesung = await compileWithCache(
    { kind: "exam", id: exam.id, variant: "loesung" },
    src.loesungTex,
    useLocal,
    undefined,
    false,
    opts
  );
  return {
    angabe,
    loesung,
    missingGraphics: [...(angabe.missingGraphics ?? []), ...(loesung.missingGraphics ?? [])],
  };
}

/** The cached PDF of one variant if it was compiled from the exam's current sources, else null (the Print step needs only what it prints). */
export async function getCurrentExamVariant(
  input: ExamSourceInput,
  variant: "angabe" | "loesung"
): Promise<CachedCompileEntry | null> {
  const useLocal = effectiveLatexCompilation() === "local";
  const src = await prepareExamSources(input, useLocal);
  const opts = { resources: src.resources, resourceExerciseIds: src.resourceExerciseIds, logo: src.logo };
  return (await getCachedFor({ kind: "exam", id: input.exam.id, variant }, variant === "angabe" ? src.angabeTex : src.loesungTex, useLocal, opts)) ?? null;
}

/** The cached Angabe/Lösung if they were compiled from the exam's current sources; "stale" when this exam was compiled before but its exercises, order or header changed since (issue #135); null when never compiled. */
export async function getCurrentExamPreview(
  input: ExamSourceInput
): Promise<{ angabe: CachedCompileEntry; loesung: CachedCompileEntry } | "stale" | null> {
  const id = input.exam.id;
  const hadAny =
    getLatestForSlot({ kind: "exam", id, variant: "angabe" }) || getLatestForSlot({ kind: "exam", id, variant: "loesung" });
  if (!hadAny) return null;
  const useLocal = effectiveLatexCompilation() === "local";
  const src = await prepareExamSources(input, useLocal);
  const opts = { resources: src.resources, resourceExerciseIds: src.resourceExerciseIds, logo: src.logo };
  const angabe = await getCachedFor({ kind: "exam", id, variant: "angabe" }, src.angabeTex, useLocal, opts);
  const loesung = await getCachedFor({ kind: "exam", id, variant: "loesung" }, src.loesungTex, useLocal, opts);
  return angabe && loesung ? { angabe, loesung } : "stale";
}
