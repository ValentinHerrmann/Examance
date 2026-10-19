/** Manual page breaks (a break goes before each listed exercise / MC group id). */

/** Adds or removes the break before `itemId`; returns a new array. */
export function togglePageBreak(breaks: readonly string[] | null | undefined, itemId: string): string[] {
  const list = breaks ?? [];
  return list.includes(itemId) ? list.filter((id) => id !== itemId) : [...list, itemId];
}

/** Keeps only breaks that still match an item (a break on the first item is inert, not dropped); null when none remain. */
export function prunePageBreaks(
  breaks: readonly string[] | null | undefined,
  itemIds: readonly string[]
): string[] | null {
  const valid = new Set(itemIds);
  const kept = (breaks ?? []).filter((id) => valid.has(id));
  return kept.length ? kept : null;
}

/** Follows id substitutions of an import (exercise ids and MC group ids live in separate maps). */
export function remapPageBreaks(
  breaks: readonly string[] | null | undefined,
  ...maps: ReadonlyMap<string, string>[]
): string[] | null | undefined {
  if (!breaks) return breaks as null | undefined;
  return breaks.map((id) => {
    for (const m of maps) {
      const next = m.get(id);
      if (next) return next;
    }
    return id;
  });
}
