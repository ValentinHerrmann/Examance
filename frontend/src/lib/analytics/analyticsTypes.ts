export interface ExercisePerformance {
  id: string;
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
  groupName: string;
  topicTag?: string;
  variants: VariantDetail[];
  maxDeltaPercent: number | null;
  flaggedFairnessIssue: boolean;
}
