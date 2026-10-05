import type { ExamRecord, ExerciseRecord } from "#lib/db/schema";
import type { McGroup } from "#lib/db/dbEncryption";
import { compileWithCache } from "#lib/latex/compileCache";
import type { CompileResult } from "#lib/latex/compiler";
import { formatExerciseLatex, formatMcGroupLatex } from "#lib/latex/scoreParser";
import type { ExamItemRef } from "#lib/grading/omrTemplatePrep";
import { exerciseResourceRepository } from "#lib/repositories/exerciseResourceRepository";
import { resolveCompileLogo } from "#lib/latex/logo";
import { effectiveLatexCompilation } from "#lib/stores/capabilities";
import { formatExamCourse } from "#lib/utils/examLabel";
import { translate } from "#lib/i18n";

/** The LaTeX `\Aufgabe` blocks of an exam in item order (standalone exercises and MC groups). */
export function buildExerciseInputs(
  examItems: ExamItemRef[],
  exercises: ExerciseRecord[],
  libraryExercises: ExerciseRecord[],
  mcGroups: McGroup[]
): string {
  let exerciseCount = 0;
  return examItems
    .map((item) => {
      if (item.type === "exercise") {
        const ex = exercises.find((e) => e.id === item.id);
        if (!ex) return "";
        exerciseCount++;
        return formatExerciseLatex(ex.latexBody, ex.name || `Aufgabe ${exerciseCount}`, ex.id);
      }
      const group = mcGroups.find((g) => g.id === item.id);
      if (!group) return "";
      const members = group.memberIds
        .map((id) => libraryExercises.find((e) => e.id === id) || exercises.find((e) => e.id === id))
        .filter((e): e is ExerciseRecord => Boolean(e));
      return formatMcGroupLatex(
        members.map((m) => ({ id: m.id, latexBody: m.latexBody || "" })),
        group.title,
        group.scoringText
      );
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * Resource files of every exercise in the exam, for the compiler. Files are written flat, so
 * same-name different files conflict; mergeResources() (lib/latex/resources.ts) raises it
 * before compiling. The server engine loads its own rows and only gets exercise ids.
 */
export async function collectExamResources(
  examItems: ExamItemRef[],
  exercises: ExerciseRecord[],
  libraryExercises: ExerciseRecord[],
  mcGroups: McGroup[],
  sessionKey: CryptoKey | null
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
  const needBytes = effectiveLatexCompilation() === "local";
  return exerciseResourceRepository.collectForCompile(owners, sessionKey, needBytes);
}

/** Full exam document. `options` are the Schulaufgabe.sty options (`sans,punkte[,antworten]`). */
export function buildExamLatex(exam: ExamRecord, exerciseInputs: string, options: string): string {
  return `\\documentclass[a4paper]{article}
\\usepackage[${options}]{sty/Schulaufgabe}
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
\\Klasse{${formatExamCourse(exam.grade, exam.klasse)}}
\\Datum{${exam.datum || ""}}
\\Nr{${exam.nr || "1"}}

${exerciseInputs}

\\end{document}`;
}

export interface ExamPreviewInput {
  exam: ExamRecord;
  exercises: ExerciseRecord[];
  libraryExercises: ExerciseRecord[];
  mcGroups: McGroup[];
  examItems: ExamItemRef[];
  key: CryptoKey | null;
  onStatus?: (status: string) => void;
}

export interface ExamPreviewResult {
  angabe: CompileResult;
  loesung: CompileResult;
  missingGraphics: string[];
}

/** Compiles the Angabe and Lösung PDFs of an exam into the compile cache. */
/** True when the exam contains exercises imported without their code (results-only archive). */
export function examHasWithheldCode(exercises: ExerciseRecord[]): boolean {
  return exercises.some((ex) => ex.codeWithheld);
}

export async function compileExamPreview(input: ExamPreviewInput): Promise<ExamPreviewResult> {
  const { exam, exercises, libraryExercises, mcGroups, examItems, key } = input;
  // Results-only imports have no LaTeX: compiling would produce empty exercise blocks.
  if (examHasWithheldCode(exercises)) throw new Error(translate("exam.resultsOnly.noCompile"));
  const inputs = buildExerciseInputs(examItems, exercises, libraryExercises, mcGroups);
  const useLocal = effectiveLatexCompilation() === "local";
  const collected = await collectExamResources(examItems, exercises, libraryExercises, mcGroups, key);
  const logo = await resolveCompileLogo(exam.id, useLocal);
  const opts = { resources: collected.inline, resourceExerciseIds: collected.exerciseIds, logo };

  const angabe = await compileWithCache(
    { kind: "exam", id: exam.id, variant: "angabe" },
    buildExamLatex(exam, inputs, "sans,punkte"),
    useLocal,
    input.onStatus,
    false,
    opts
  );
  const loesung = await compileWithCache(
    { kind: "exam", id: exam.id, variant: "loesung" },
    buildExamLatex(exam, inputs, "sans,punkte,antworten"),
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
