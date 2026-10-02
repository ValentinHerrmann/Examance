/**
 * Sub-item labels of an MC group ("a)", "b)", …).
 *
 * The exam PDF numbers group members with `\alph*`, which only goes up to 26.
 * Larger groups switch to `\arabic*` (see `formatMcGroupLatex` in
 * `$lib/latex/scoreParser` and `format_mc_group_latex` in
 * `backend/app/services/latex.py`). Every on-screen label must follow the same
 * rule, or the UI would call a question "c)" that the sheet prints as "3)".
 */
export const ALPHA_LABEL_LIMIT = 26;

/** Whether a group of `count` members is labelled with letters (vs. numbers). */
export function usesAlphaLabels(count: number): boolean {
  return count <= ALPHA_LABEL_LIMIT;
}

/** Label of the member at zero-based `index` in a group of `count` members, without ")". */
export function mcSubLabel(index: number, count: number): string {
  return usesAlphaLabels(count) ? String.fromCharCode(97 + index) : String(index + 1);
}

/** exerciseId → sub-label for every member of the given groups (e.g. for the "a) 1/2" score stamp). */
export function buildSubLabelMap(groups: readonly { memberIds: readonly string[] }[]): Map<string, string> {
  const labels = new Map<string, string>();
  for (const group of groups) {
    group.memberIds.forEach((memberId, idx) => labels.set(memberId, mcSubLabel(idx, group.memberIds.length)));
  }
  return labels;
}
