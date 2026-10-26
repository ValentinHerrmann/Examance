export interface ExercisePerformance {
  id: string;
  /** Only a real exerciseGroupId (not the name/id fallback key), so it is safe to link. */
  groupId?: string;
  name: string;
  topicTag?: string;
  grade?: string;
  subject?: string;
  totalAppeared: number;
  avgScorePercent: number | null;
  flaggedProblematic: boolean;
}

export interface VariantDetail {
  exerciseId: string;
  variantKey: string;
  name: string;
  maxPoints: number;
  totalAppeared: number;
  avgScorePercent: number | null;
}

export interface VariantGroupComparison {
  groupId: string;
  /** True when groupId is a real exerciseGroupId (not the name fallback), so it is safe to link. */
  groupIdIsReal?: boolean;
  groupName: string;
  topicTag?: string;
  variants: VariantDetail[];
  maxDeltaPercent: number | null;
  flaggedFairnessIssue: boolean;
}
