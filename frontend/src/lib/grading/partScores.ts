/** Part scores (Teilaufgaben, issue #187): kept inside the sealed score payload as `partScores` (letter -> points); the exercise score is their sum. */

import { parseExerciseStructure } from "#lib/latex/exerciseStructure";
import { isMcQuestion } from "./mcScore";

export type PartScores = Record<string, number | null>;

export interface PartInfo {
  label: string;
  max: number;
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

const round = (v: number) => Math.round(v * 100) / 100;

/** Sum of the graded parts; null when no part has a value. */
export function sumParts(parts: PartScores | undefined): number | null {
  const values = Object.values(parts ?? {}).filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  return values.length === 0 ? null : round(values.reduce((s, v) => s + v, 0));
}

/** The parts to store next to `value`: kept only while they still add up to it, so a total edited elsewhere (manual grid, paste import) drops stale parts. */
export function reconcileParts(value: number, parts: PartScores | undefined): PartScores | undefined {
  if (!parts) return undefined;
  const sum = sumParts(parts);
  return sum !== null && sum === round(value) ? parts : undefined;
}

/** Key of a part in `manualOverride`. */
export function partOverrideKey(exerciseId: string, label: string): string {
  return `${exerciseId}#${label}`;
}
