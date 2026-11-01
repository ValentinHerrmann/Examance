/** Part scores (Teilaufgaben, issue #187): kept inside the sealed score payload as `partScores` (part letter -> points, plus `REST_KEY` for points outside the parts). Rules: docs/dev/mc_model.md. */

import { parseExerciseStructure } from "#lib/latex/exerciseStructure";
import { isMcQuestion } from "./mcScore";

export type PartScores = Record<string, number | null>;

/** Bucket of the points outside every part (an introduction's `\BE`, stamps placed without a part). */
export const REST_KEY = "_";

export interface PartInfo {
  label: string;
  max: number;
}

/** What part grading needs of an exercise. */
export interface PartExercise {
  id: string;
  maxPoints: number;
  latexBody?: string;
  questionType?: string;
}

const partCache = new Map<string, PartInfo[]>();

/** The exercise's parts with their maximum points, read from its LaTeX; MC questions never have parts. */
export function exerciseParts(ex: { latexBody?: string; questionType?: string }): PartInfo[] {
  if (isMcQuestion(ex) || !ex.latexBody) return [];
  let parts = partCache.get(ex.latexBody);
  if (!parts) {
    parts = parseExerciseStructure(ex.latexBody).parts.map((p) => ({ label: p.label, max: p.score }));
    if (partCache.size > 500) partCache.clear();
    partCache.set(ex.latexBody, parts);
  }
  return parts;
}

/** Points of the exercise outside its parts (0 when the parts cover its maximum). */
export function restMax(ex: PartExercise): number {
  return Math.max(0, round(ex.maxPoints - exerciseParts(ex).reduce((s, p) => s + p.max, 0)));
}

const round = (v: number) => Math.round(v * 100) / 100;
const isNum = (v: unknown): v is number => typeof v === "number" && !Number.isNaN(v);

/** True when at least one part letter (not the rest) has a value: the exercise is then graded part by part. */
export function hasPartValues(parts: PartScores | undefined): boolean {
  return Object.entries(parts ?? {}).some(([k, v]) => k !== REST_KEY && isNum(v));
}

/** Keeps only the exercise's current part letters and the rest, so a part deleted in the editor stops counting. */
export function prunePartScores(ex: PartExercise, parts: PartScores | undefined): PartScores {
  const keep = new Set([...exerciseParts(ex).map((p) => p.label), REST_KEY]);
  return Object.fromEntries(Object.entries(parts ?? {}).filter(([k]) => keep.has(k)));
}

/** The exercise score from its parts: null until every part has a value; the rest counts when set; never above the exercise maximum. */
export function partTotal(ex: PartExercise, parts: PartScores | undefined): number | null {
  const letters = exerciseParts(ex);
  if (letters.length === 0 || !letters.every((p) => isNum(parts?.[p.label]))) return null;
  const sum = letters.reduce((s, p) => s + (parts![p.label] as number), 0) + (isNum(parts?.[REST_KEY]) ? parts![REST_KEY]! : 0);
  return round(Math.min(ex.maxPoints, sum));
}

/** Key of a part in `manualOverride`. */
export function partOverrideKey(exerciseId: string, label: string): string {
  return `${exerciseId}#${label}`;
}
