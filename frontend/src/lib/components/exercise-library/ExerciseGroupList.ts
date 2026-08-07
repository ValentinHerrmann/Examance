import type { ExerciseRecord } from "$lib/db/schema";

interface VariantMember {
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
