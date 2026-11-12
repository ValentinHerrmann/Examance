import type { ExerciseRecord } from "#lib/db/schema";
import type { ResyncVariant } from "#lib/api/exerciseSharing";
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

/** Any member is shared with other accounts (sharing applies to the whole group). */
export function groupIsShared(group: ExerciseGroup): boolean {
  return group.allMembers.some((m) => m.ex.isShared);
}

/** Copied from another account: never shared as one's own (contributing back is the path). */
export function groupIsCopy(group: ExerciseGroup): boolean {
  return group.allMembers.some((m) => m.ex.groupCopied);
}

/** The group's library flags (issue #252), carried by every member row. */
export function groupFlags(group: ExerciseGroup): { favorite: boolean; archived: boolean } {
  return {
    favorite: group.allMembers.some((m) => m.ex.groupFavorite),
    archived: group.allMembers.some((m) => m.ex.groupArchivedAt),
  };
}

/** "Variant X" for a resync/proposal row, else its name; `prefer` picks which side is read first. */
export function resyncVariantLabel(v: ResyncVariant, prefer: "own" | "source"): string {
  const [first, second] = prefer === "own" ? [v.own, v.source] : [v.source, v.own];
  const key = first?.variantKey || second?.variantKey;
  return key ? translate("exercises.sharing.resyncModal.variant", { key }) : first?.name || second?.name || "";
}

/** Points of one exercise: the LaTeX score wins, the stored maximum is the fallback. */
export function variantPoints(source: VariantMember | ExerciseRecord): number {
  const ex = "ex" in source ? source.ex : source;
  return parseExerciseScore(ex.latexBody || "") || ex.maxPoints || 0;
}

/** Current members bucketed by variant key, `_General` first, newest version first inside each variant. */
function sortedVariantsOf(currentMembers: ExerciseRecord[]): Map<string, VariantMember[]> {
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
  return sortedVariants;
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

    const sortedVariants = sortedVariantsOf(currentMembers);
    const allMembers: VariantMember[] = [...sortedVariants.values()].flat();

    const scores = allMembers.map(variantPoints);
    const maxPoints = scores.length > 0 ? Math.max(...scores) : 0;
    const minPoints = scores.length > 0 ? Math.min(...scores) : 0;

    groups.push({ groupId, name, topicTag, grade, subject, maxPoints, minPoints, variants: sortedVariants, allMembers });
  }

  groups.sort((a, b) => a.name.localeCompare(b.name));
  return groups;
}
