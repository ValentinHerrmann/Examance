import { get } from "svelte/store";
import { effectiveRedoRect } from "./omrShape";
import { loadPdfjs } from "#lib/pdf/pdfjs";
import type { 
  ExamRecord, 
  ExerciseRecord, 
  OmrPageTemplate, 
  OmrBubbleRect, 
  OmrFiducialRect, 
  OmrTemplatePayload 
} from "#lib/db/schema";
import { 
  type McGroup, 
  loadExamEncrypted, 
  loadExamExercisesEncrypted, 
  loadLocalMcGroups, 
  loadExercisesEncrypted, 
  saveOmrTemplateEncrypted 
} from "#lib/db/dbEncryption";
import { computeMcExercisesHash, resolveMcExercises } from "#lib/grading/mcExerciseHash";
import { compileWithCache } from "#lib/latex/compileCache";
import { buildExamLatex, buildExerciseInputs, collectExamResources } from "#lib/exam/examPreview";
import { resolveCompileLogo } from "#lib/latex/logo";
import { mapApiToExerciseRecord } from "#lib/repositories/exerciseRepository";
import { api } from "#lib/api/client";
import { mapApiToExamRecord } from "#lib/repositories/examRepository";
import { isAuthenticated } from "#lib/stores/session";
import { storagePolicyStore } from "#lib/stores/storagePolicy";
import { translate } from "#lib/i18n";

export interface ExamItemRef {
  type: "exercise" | "mc_group";
  id: string;
}

export function buildExamItems(exs: ExerciseRecord[], groups: McGroup[]): ExamItemRef[] {
  const memberIds = new Set(groups.flatMap((g) => g.memberIds));
  const entries: { order: number; item: ExamItemRef }[] = [];

  exs.forEach((ex, idx) => {
    if (memberIds.has(ex.id)) return;
    entries.push({ order: ex.orderIndex ?? idx + 1, item: { type: "exercise", id: ex.id } });
  });

  groups.forEach((g, idx) => {
    const memberOrders = g.memberIds
      .map((id) => exs.find((e) => e.id === id)?.orderIndex)
      .filter((o): o is number => typeof o === "number");
    const order =
      g.orderIndex ??
      (memberOrders.length > 0 ? Math.min(...memberOrders) : exs.length + idx + 1);
    entries.push({ order, item: { type: "mc_group", id: g.id } });
  });

  return entries
    .map((entry, idx) => ({ ...entry, idx }))
    .sort((a, b) => a.order - b.order || a.idx - b.idx)
    .map((entry) => entry.item);
}

export function mapRemoteMcGroups(rawGroups: any[]): McGroup[] {
  return rawGroups.map((g: any, idx: number) => ({
    id: g.id,
    title: g.title,
    scoringText: g.scoring_text ?? g.scoringText,
    memberIds: (g.member_ids || g.members || []).map((m: any) =>
      typeof m === "string" ? m : m.id,
    ),
    orderIndex: g.order_index ?? g.orderIndex ?? idx + 1,
  }));
}

export interface ExamCompileContext {
  exam: ExamRecord;
  exercises: ExerciseRecord[];
  libraryExercises: ExerciseRecord[];
  mcGroups: McGroup[];
}

export async function loadExamCompileContext(examId: string, key: CryptoKey | null): Promise<ExamCompileContext | null> {
  let exam: ExamRecord | null = null;
  let exercises: ExerciseRecord[] = [];
  let mcGroups: McGroup[] = [];
  let libraryExercises: ExerciseRecord[] = [];

  if (get(isAuthenticated)) {
    try {
      const remoteExam = (await api.get(`/exams/${examId}`)) as any;
      exam = mapApiToExamRecord(remoteExam);
      exercises = remoteExam.exercises.map(mapApiToExerciseRecord);
      if (remoteExam.mc_groups && Array.isArray(remoteExam.mc_groups)) {
        mcGroups = mapRemoteMcGroups(remoteExam.mc_groups);
      } else {
        mcGroups = await loadLocalMcGroups(examId);
      }
    } catch (serverErr) {
      exam = (await loadExamEncrypted(examId, key)) || null;
      if (exam) {
        exercises = await loadExamExercisesEncrypted(examId, key);
        mcGroups = await loadLocalMcGroups(examId);
      }
    }
  } else {
    exam = (await loadExamEncrypted(examId, key)) || null;
    exercises = await loadExamExercisesEncrypted(examId, key);
    mcGroups = await loadLocalMcGroups(examId);
  }

  if (!exam) return null;

  try {
    libraryExercises = await loadExercisesEncrypted(key);
  } catch {}

  return { exam, exercises, libraryExercises, mcGroups };
}

export interface PrepareOmrTemplateArgs {
  examId: string;
  exam: ExamRecord;
  exercises: ExerciseRecord[];
  libraryExercises: ExerciseRecord[];
  mcGroups: McGroup[];
  key: CryptoKey | null;
  onProgress?: (msg: string) => void;
  examItems?: ExamItemRef[];
}

export interface PrepareOmrTemplateResult {
  status: 'ready' | 'stale';
  message: string;
  pages: OmrPageTemplate[];
  totalBubbles: number;
  exercisesHash: string;
}

export async function prepareOmrTemplate(args: PrepareOmrTemplateArgs): Promise<PrepareOmrTemplateResult> {
  const { examId, exam, exercises, libraryExercises, mcGroups, key, onProgress, examItems: suppliedExamItems } = args;

  onProgress?.(translate("exam.page.omr.checkingExercises"));

  const mcExercises = resolveMcExercises(exercises, libraryExercises, mcGroups);
  console.log("[PrepareOMR] MC exercises count:", mcExercises.length, mcExercises.map((e) => ({ id: e.id, name: e.name })));
  if (mcExercises.length === 0) {
    throw new Error(translate("exam.page.omr.noExercisesError"));
  }

  // Results-only imports carry no LaTeX: a blank sheet cannot be compiled, so no new scans are read.
  if (mcExercises.some((ex) => ex.codeWithheld)) {
    throw new Error(translate("exam.resultsOnly.noOmr"));
  }

  const invalidExs = mcExercises.filter(
    (ex) => !ex.latexBody || (!ex.latexBody.includes("\\multi") && !ex.latexBody.includes("\\Lmulti"))
  );
  if (invalidExs.length > 0) {
    const names = invalidExs.map((ex) => `'${ex.name || ex.id}'`).join(", ");
    throw new Error(translate("exam.page.omr.invalidExercisesError", { names }));
  }

  onProgress?.(translate("exam.page.omr.compilingBlank"));

  const examItems = suppliedExamItems ?? buildExamItems(exercises, mcGroups);
  const exerciseInputs = buildExerciseInputs(examItems, exercises, libraryExercises, mcGroups);

  const fullTex = buildExamLatex(exam, exerciseInputs, "sans,punkte");

  const omrExCount = (fullTex.match(/\\OmrExercise/g) || []).length;
  const multiCount = (fullTex.match(/\\multi/g) || []).length;
  const lmultiCount = (fullTex.match(/\\Lmulti/g) || []).length;
  console.log(`[PrepareOMR] LaTeX macro counts in fullTex: \\OmrExercise=${omrExCount}, \\multi=${multiCount}, \\Lmulti=${lmultiCount}, fullTex length=${fullTex.length}`);

  const useLocal = get(storagePolicyStore).latexCompilation === "local";
  if (!useLocal && !get(isAuthenticated)) {
    throw new Error(translate("exam.page.omr.loginRequired"));
  }

  const collected = await collectExamResources(examItems, exercises, libraryExercises, mcGroups, key);
  // Same header as the printed exam, so the template matches the sheets that get scanned.
  const logo = await resolveCompileLogo(examId, useLocal);
  const resourceOptions = { resources: collected.inline, resourceExerciseIds: collected.exerciseIds, logo };

  const result = await compileWithCache(
    { kind: "omr-blank", id: examId, variant: "blank" },
    fullTex,
    useLocal,
    (status) => {
      if (status === "downloading") {
        onProgress?.(translate("exam.page.omr.loadingCompiler"));
      } else if (status === "compiling") {
        onProgress?.(translate("exam.page.omr.compilingBlank"));
      }
    },
    true,
    resourceOptions
  );
  console.log(`[PrepareOMR] LaTeX compile finished: pdfBytes=${result.pdfBytes?.length ?? 0}, engineUsed=${result.engineUsed ?? (useLocal ? "local" : "server")}, usedFallback=${result.usedFallback ?? false}`);

  onProgress?.(translate("exam.page.omr.extractingBubbles"));

  const pdfjsLib = await loadPdfjs();
  const pdfDoc = await pdfjsLib.getDocument({ data: result.pdfBytes }).promise;
  console.log(`[PrepareOMR] pdfDoc loaded: numPages=${pdfDoc.numPages}`);

  const pages: OmrPageTemplate[] = [];
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const pdfPage = await pdfDoc.getPage(pageNum);
    const viewport = pdfPage.getViewport({ scale: 1 });
    const annotations = await pdfPage.getAnnotations();

    const bubbles: OmrBubbleRect[] = [];
    const fiducials: OmrFiducialRect[] = [];
    const redoRects = new Map<string, [number, number, number, number]>();

    for (const ann of annotations) {
      if (ann.subtype !== "Link") continue;
      const uri: string = ann.unsafeUrl ?? ann.url ?? "";
      const match = /^omr:\/\/([^/]+)\/(\d+)(\/redo)?$/.exec(uri);
      if (!match) continue;

      const [, token, idxStr, isRedo] = match;
      const rect = ann.rect as [number, number, number, number];
      if (token === "__fid__") {
        const corner = Number(idxStr);
        if (corner === 0 || corner === 1 || corner === 2 || corner === 3) {
          fiducials.push({ corner, rect });
        }
      } else if (isRedo) {
        redoRects.set(`${token}|${idxStr}`, rect);
      } else {
        bubbles.push({ exerciseId: token, optionIndex: Number(idxStr), rect });
      }
    }

    for (const b of bubbles) {
      const redoRect = redoRects.get(`${b.exerciseId}|${b.optionIndex}`);
      // The captured redo link overlaps the box itself (zero-width \makebox + \special in
      // Loesung.sty); store the zone that is really left of it. The worker applies the same
      // correction to templates captured before this fix.
      if (redoRect) b.redoRect = effectiveRedoRect(b.rect, redoRect);
    }

    console.log(`[PrepareOMR] Page ${pageNum}: totalAnnotations=${annotations.length}, fiducials=${fiducials.length}, bubbles=${bubbles.length}`);

    pages.push({
      pageIndex: pageNum - 1,
      pageWidthPt: viewport.width,
      pageHeightPt: viewport.height,
      fiducials,
      bubbles,
    });
  }

  console.log("[PrepareOMR] Pages extraction summary:", pages.map((p) => ({ page: p.pageIndex + 1, fiducials: p.fiducials.length, bubbles: p.bubbles.length })));

  const payload: OmrTemplatePayload = { pages };
  const exercisesHash = await computeMcExercisesHash(mcExercises, mcGroups);
  await saveOmrTemplateEncrypted(examId, exercisesHash, payload, key);
  
  const totalBubbles = pages.reduce((sum, p) => sum + p.bubbles.length, 0);
  const shortPages = pages.filter((p) => p.fiducials.length < 4).map((p) => p.pageIndex + 1);
  
  if (totalBubbles === 0) {
    console.warn(`[PrepareOMR] FAILED: totalBubbles is 0 despite ${mcExercises.length} MC exercise(s). Macro counts in fullTex were: \\OmrExercise=${omrExCount}, \\multi=${multiCount}, \\Lmulti=${lmultiCount}`);
    return {
      status: 'stale',
      message: translate("exam.page.omr.noBubblesError"),
      pages,
      totalBubbles,
      exercisesHash
    };
  } else if (shortPages.length > 0) {
    return {
      status: 'stale',
      message: translate("exam.page.omr.shortFiducialsError", { pages: shortPages.join(", ") }),
      pages,
      totalBubbles,
      exercisesHash
    };
  } else {
    return {
      status: 'ready',
      message: translate("exam.page.omr.templateSaved", {
        pageCount: pages.length,
        bubbleCount: totalBubbles,
      }),
      pages,
      totalBubbles,
      exercisesHash
    };
  }
}
