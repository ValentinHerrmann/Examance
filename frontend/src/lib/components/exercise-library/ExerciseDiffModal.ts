import type { ExerciseRecord } from "$lib/db/schema";

export function getDiffSelectLabel(ex: ExerciseRecord): string {
  const name = ex.name || "Untitled";
  const v = ex.version || 1;
  const variantStr = ex.variantKey ? `, Variant: ${ex.variantKey}` : "";
  return `${name} (v${v}${variantStr})`;
}
