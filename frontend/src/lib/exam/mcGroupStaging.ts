/** Pure state transitions for building MC groups from library questions on the exam page. An exercise links to an exam at most once (`[examId+exerciseId]` junction key), so a question belongs to at most one group. */

export interface McGroupDraft {
  id: string;
  title: string;
  scoringText: string;
  memberIds: string[];
}

// Default group title and scoring sentence are exam CONTENT printed verbatim in the German exam PDF (see i18n brief "Do NOT translate"), not UI strings.
export const DEFAULT_MC_GROUP_TITLE = "Grundlagen";
export const DEFAULT_MC_GROUP_SCORING_TEXT =
  "Für jedes korrekte Kreuz 1BE; für jedes falsche Kreuz -0,5BE. Pro Teilaufgabe aber immer $\\geq$0BE";

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

/** Commits the draft: a new group, the edited group updated, or the edited group removed once all its questions were unstaged; `null` when there is nothing to commit. */
export function commitStagedGroup<G extends McGroupDraft>(
  groups: readonly G[],
  draft: { editingId: string | null; staged: readonly string[]; title: string; scoringText: string },
  newId?: () => string,
): { groups: (G | McGroupDraft)[]; memberIds: string[]; previousMemberIds: Set<string> } | null {
  const edited = draft.editingId ? groups.find((g) => g.id === draft.editingId) : undefined;
  const previousMemberIds = new Set(edited?.memberIds ?? []);
  if (!canFinalizeGroup(draft.staged)) {
    if (!edited) return null;
    return { groups: groups.filter((g) => g !== edited), memberIds: [], previousMemberIds };
  }
  const memberIds = [...draft.staged];
  const next = applyGroup(groups, { editingId: edited?.id ?? null, title: draft.title, scoringText: draft.scoringText, memberIds }, newId);
  return { groups: next, memberIds, previousMemberIds };
}

/** True when two ordered id lists differ (length, membership or order). */
export function idsChanged(a: readonly string[], b: readonly string[]): boolean {
  return a.length !== b.length || a.some((id, i) => id !== b[i]);
}
