import type { ExerciseRecord } from "#lib/db/schema";
import { parseExerciseScore } from "#lib/latex/scoreParser";
import { translate } from "#lib/i18n";

export interface VariantMember {
  ex: ExerciseRecord;
  variantLabel: string;
  version: number;
  isCurrent: boolean;
}

export interface ExerciseGroup {
  groupId: string;
  name: string;
  topicTag: string;
  grade?: string;
  subject?: string;
  maxPoints: number;
  minPoints: number;
  variants: Map<string, VariantMember[]>;
  allMembers: VariantMember[];
}

export function getGroupRepresentative(group: ExerciseGroup): ExerciseRecord {
  return group.allMembers[0]?.ex || ({ id: "", name: group.name } as ExerciseRecord);
}

/** Buckets exercises by group id (or name), keeping only current versions, variants sorted `_General` first. */
export function groupExercises(exs: ExerciseRecord[]): ExerciseGroup[] {
  const buckets = new Map<string, ExerciseRecord[]>();

  for (const ex of exs) {
    const key = ex.exerciseGroupId || `name:${ex.name || translate("exercises.untitled")}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(ex);
  }

  const groups: ExerciseGroup[] = [];

  for (const [groupId, members] of buckets) {
    const currentMembers = members.filter((m) => m.isCurrent !== false);
    if (currentMembers.length === 0) continue;

    const name = currentMembers[0]?.name || translate("exercises.untitled");
    const topicTag = currentMembers[0]?.topicTag || "_General";
    const grade = currentMembers[0]?.grade;
    const subject = currentMembers[0]?.subject;

    const variants = new Map<string, VariantMember[]>();
    for (const ex of currentMembers) {
      const vKey = ex.variantKey || "_General";
      if (!variants.has(vKey)) variants.set(vKey, []);
      variants.get(vKey)!.push({
        ex,
        variantLabel: vKey,
        version: ex.version || 1,
        isCurrent: ex.isCurrent !== false,
      });
    }

    const sortedVariants = new Map<string, VariantMember[]>();
    const keys = [...variants.keys()].sort((a, b) => {
      if (a === "_General") return -1;
      if (b === "_General") return 1;
      return a.localeCompare(b);
    });
    for (const k of keys) sortedVariants.set(k, variants.get(k)!);

    for (const [, vMembers] of sortedVariants) {
      vMembers.sort((a, b) => b.version - a.version);
    }

    const allMembers: VariantMember[] = [];
    for (const [, vMembers] of sortedVariants) {
      allMembers.push(...vMembers);
    }

    const scores = allMembers.map((m) => parseExerciseScore(m.ex.latexBody || "") || m.ex.maxPoints || 0);
    const maxPoints = scores.length > 0 ? Math.max(...scores) : 0;
    const minPoints = scores.length > 0 ? Math.min(...scores) : 0;

    groups.push({ groupId, name, topicTag, grade, subject, maxPoints, minPoints, variants: sortedVariants, allMembers });
  }

  groups.sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}
