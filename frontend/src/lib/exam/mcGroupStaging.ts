/**
 * Pure state transitions for building MC groups from library questions, shared by the
 * exam-creation route and the exam page. An exercise links to an exam at most once
 * (`[examId+exerciseId]` junction key), so a question belongs to at most one group.
 */

export interface McGroupDraft {
  id: string;
  title: string;
  scoringText: string;
  memberIds: string[];
}

/** A group needs at least this many questions. There is no upper limit. */
export const MC_GROUP_MIN_MEMBERS = 1;

/** Maps each exercise already in a group to that group's title; `excludeGroupId` (the group being edited) keeps its members selectable. */
export function buildMcGroupMembership(
  groups: readonly McGroupDraft[],
  excludeGroupId: string | null = null,
): Record<string, string> {
  const membership: Record<string, string> = {};
  for (const group of groups) {
    if (group.id === excludeGroupId) continue;
    for (const memberId of group.memberIds) membership[memberId] = group.title;
  }
  return membership;
}

/** Adds or removes `id` from the staged list; questions owned by another group are refused. */
export function toggleStaged(
  staged: readonly string[],
  id: string,
  membership: Readonly<Record<string, string>>,
): string[] {
  if (staged.includes(id)) return staged.filter((stagedId) => stagedId !== id);
  if (id in membership) return [...staged];
  return [...staged, id];
}

/** Swaps the staged question at `index` with its neighbour; out-of-range moves are no-ops. */
export function moveStaged(staged: readonly string[], index: number, direction: "up" | "down"): string[] {
  const target = direction === "up" ? index - 1 : index + 1;
  const next = [...staged];
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function canFinalizeGroup(staged: readonly string[]): boolean {
  return staged.length >= MC_GROUP_MIN_MEMBERS;
}

/** Creates a group from the staged questions, or updates `editingId` in place (keeping id and position). Returns the new groups array. */
export function applyGroup<G extends McGroupDraft>(
  groups: readonly G[],
  draft: { editingId: string | null; title: string; scoringText: string; memberIds: readonly string[] },
  newId: () => string = () => crypto.randomUUID(),
): (G | McGroupDraft)[] {
  const fields = { title: draft.title, scoringText: draft.scoringText, memberIds: [...draft.memberIds] };
  if (draft.editingId) {
    return groups.map((g) => (g.id === draft.editingId ? { ...g, ...fields } : g));
  }
  return [...groups, { id: newId(), ...fields }];
}
