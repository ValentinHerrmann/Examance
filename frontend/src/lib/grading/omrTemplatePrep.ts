import { get } from "svelte/store";
import { effectiveRedoRect } from "./omrShape";
import { loadPdfjs } from "#lib/pdf/pdfjs";
import type { 
  ExamRecord, 
  ExerciseRecord, 
  OmrPageTemplate, 
  OmrBubbleRect, 
  OmrFiducialRect, 
  OmrScoreBoxRect,
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
import { buildExamLatex, buildExerciseBlocks, buildExerciseInputs, collectExamResources } from "#lib/exam/examPreview";
import { parseOmrUri, scoreBoxKey } from "./omrUri";
import { getAccountPackages } from "#lib/latex/packageSettings";
import { stripSourceMarkers } from "#lib/latex/sourceMap";
import { resolveCompileLogo } from "#lib/latex/logo";
import { mapApiToExerciseRecord } from "#lib/repositories/exerciseRepository";
import { api } from "#lib/api/client";
import { mapApiToExamRecord } from "#lib/repositories/examRepository";
import { isAuthenticated } from "#lib/stores/session";
import { effectiveLatexCompilation } from "#lib/stores/capabilities";
import { translate } from "#lib/i18n";

export interface ExamItemRef {
  type: "exercise" | "mc_group";
  id: string;
}

/** Rebuilds the item order from persisted order indices; members share their group's index and are not emitted alone. */
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

type OmrLayoutInput = ExamCompileContext & { examItems?: ExamItemRef[] };

/** LaTeX of the blank answer sheet the OMR template is captured from (the printed Angabe). */
export async function buildOmrBlankTex(ctx: OmrLayoutInput): Promise<string> {
  const { exam, exercises, libraryExercises, mcGroups } = ctx;
  const examItems = ctx.examItems ?? buildExamItems(exercises, mcGroups);
  const exerciseInputs = buildExerciseInputs(examItems, exercises, libraryExercises, mcGroups, exam.pageBreaks);
  return buildExamLatex(exam, exerciseInputs, "sans,punkte", await getAccountPackages());
}

/** Capture format of the template; part of the hash, so templates captured before score boxes (issue #187) turn stale and are rebuilt once. */
export const OMR_TEMPLATE_VERSION = 2;

async function hashOmrTemplate(mcExercises: ExerciseRecord[], mcGroups: McGroup[], blankTex: string): Promise<string> {
  // Unmarked, so stored hashes stay valid and only real document changes mark the template stale.
  const data = new TextEncoder().encode(`v${OMR_TEMPLATE_VERSION}\n${await computeMcExercisesHash(mcExercises, mcGroups)}\n${stripSourceMarkers(blankTex)}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Identity of an OMR template: the MC answer key plus the whole blank sheet's LaTeX, so editing any exercise, reordering items or a page break marks it stale (bubbles move), not only answer-key edits (issue #135). */
export async function computeOmrTemplateHash(ctx: OmrLayoutInput): Promise<string> {
  const mcExercises = resolveMcExercises(ctx.exercises, ctx.libraryExercises, ctx.mcGroups);
  return hashOmrTemplate(mcExercises, ctx.mcGroups, await buildOmrBlankTex(ctx));
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
  totalScoreBoxes: number;
  exercisesHash: string;
}

/** Union of two PDF rects (one score box can be captured as several links, e.g. the grade cell spanning two table rows). */
function unionRect(a: [number, number, number, number], b: [number, number, number, number]): [number, number, number, number] {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** Exam position -> exercise ids; empty unless the captured exercise boxes match the blocks one to one, so a body with its own extra `\begin{Aufgabe}` never fills a wrong box. */
export function mapScorePositions(blockExerciseIds: string[][], pages: OmrPageTemplate[]): Record<number, string[]> {
  const captured = new Set(pages.flatMap((p) => (p.scoreBoxes ?? []).filter((b) => b.box === "task").map((b) => b.position)));
  const expected = blockExerciseIds.map((_, i) => i + 1);
  if (captured.size !== expected.length || expected.some((n) => !captured.has(n))) {
    if (captured.size > 0) console.warn(`[PrepareOMR] Score boxes not mapped: ${captured.size} exercise box(es) for ${expected.length} block(s)`);
    return {};
  }
  return Object.fromEntries(blockExerciseIds.map((ids, i) => [i + 1, ids]));
}

export async function prepareOmrTemplate(args: PrepareOmrTemplateArgs): Promise<PrepareOmrTemplateResult> {
  const { examId, exam, exercises, libraryExercises, mcGroups, key, onProgress, examItems: suppliedExamItems } = args;

  onProgress?.(translate("exam.page.omr.checkingExercises"));

  const mcExercises = resolveMcExercises(exercises, libraryExercises, mcGroups);
  console.log("[PrepareOMR] MC exercises count:", mcExercises.length, mcExercises.map((e) => ({ id: e.id, name: e.name })));
  if (exercises.length === 0 && mcExercises.length === 0) {
    throw new Error(translate("exam.page.omr.noExercisesError"));
  }

  // Results-only imports carry no LaTeX: a blank sheet cannot be compiled, so no new scans are read.
  if (mcExercises.some((ex) => ex.codeWithheld) || exercises.some((ex) => ex.codeWithheld)) {
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
  const fullTex = await buildOmrBlankTex({ exam, exercises, libraryExercises, mcGroups, examItems });

  const omrExCount = (fullTex.match(/\\OmrExercise/g) || []).length;
  const multiCount = (fullTex.match(/\\multi/g) || []).length;
  const lmultiCount = (fullTex.match(/\\Lmulti/g) || []).length;
  console.log(`[PrepareOMR] LaTeX macro counts in fullTex: \\OmrExercise=${omrExCount}, \\multi=${multiCount}, \\Lmulti=${lmultiCount}, fullTex length=${fullTex.length}`);

  const useLocal = effectiveLatexCompilation() === "local";
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
    const boxes = new Map<string, OmrScoreBoxRect>();

    for (const ann of annotations) {
      if (ann.subtype !== "Link") continue;
      const parsed = parseOmrUri(ann.unsafeUrl ?? ann.url ?? "");
      if (!parsed) continue;
      const rect = ann.rect as [number, number, number, number];
      if (parsed.kind === "fiducial") {
        fiducials.push({ corner: parsed.corner, rect });
      } else if (parsed.kind === "bubble" && parsed.redo) {
        redoRects.set(`${parsed.exerciseId}|${parsed.optionIndex}`, rect);
      } else if (parsed.kind === "bubble") {
        bubbles.push({ exerciseId: parsed.exerciseId, optionIndex: parsed.optionIndex, rect });
      } else {
        const key = scoreBoxKey(parsed);
        const prev = boxes.get(key);
        boxes.set(key, { box: parsed.box, position: parsed.position, part: parsed.part, rect: prev ? unionRect(prev.rect, rect) : rect });
      }
    }

    for (const b of bubbles) {
      const redoRect = redoRects.get(`${b.exerciseId}|${b.optionIndex}`);
      // The captured redo link overlaps the box itself (zero-width \makebox + \special in Loesung.sty); store the zone that is really left of it. The worker applies the same correction to templates captured before this fix.
      if (redoRect) b.redoRect = effectiveRedoRect(b.rect, redoRect);
    }

    console.log(`[PrepareOMR] Page ${pageNum}: totalAnnotations=${annotations.length}, fiducials=${fiducials.length}, bubbles=${bubbles.length}, scoreBoxes=${boxes.size}`);

    pages.push({
      pageIndex: pageNum - 1,
      pageWidthPt: viewport.width,
      pageHeightPt: viewport.height,
      fiducials,
      bubbles,
      scoreBoxes: [...boxes.values()],
    });
  }

  console.log("[PrepareOMR] Pages extraction summary:", pages.map((p) => ({ page: p.pageIndex + 1, fiducials: p.fiducials.length, bubbles: p.bubbles.length })));

  const blockIds = buildExerciseBlocks(examItems, exercises, libraryExercises, mcGroups).map((b) => b.exerciseIds);
  const positions = mapScorePositions(blockIds, pages);
  const payload: OmrTemplatePayload = { pages, version: OMR_TEMPLATE_VERSION, positions };
  const exercisesHash = await hashOmrTemplate(mcExercises, mcGroups, fullTex);
  await saveOmrTemplateEncrypted(examId, exercisesHash, payload, key);
  
  const totalBubbles = pages.reduce((sum, p) => sum + p.bubbles.length, 0);
  const totalScoreBoxes = pages.reduce((sum, p) => sum + (p.scoreBoxes?.length ?? 0), 0);
  const shortPages = pages.filter((p) => p.fiducials.length < 4).map((p) => p.pageIndex + 1);
  const base = { pages, totalBubbles, totalScoreBoxes, exercisesHash };
  
  if (mcExercises.length > 0 && totalBubbles === 0) {
    console.warn(`[PrepareOMR] FAILED: totalBubbles is 0 despite ${mcExercises.length} MC exercise(s). Macro counts in fullTex were: \\OmrExercise=${omrExCount}, \\multi=${multiCount}, \\Lmulti=${lmultiCount}`);
    return {
      status: 'stale',
      message: translate("exam.page.omr.noBubblesError"),
      ...base,
    };
  } else if (shortPages.length > 0) {
    return {
      status: 'stale',
      message: translate("exam.page.omr.shortFiducialsError", { pages: shortPages.join(", ") }),
      ...base,
    };
  } else {
    return {
      status: 'ready',
      message: translate("exam.page.omr.templateSaved", {
        pageCount: pages.length,
        bubbleCount: totalBubbles,
        boxCount: totalScoreBoxes,
      }),
      ...base,
    };
  }
}
