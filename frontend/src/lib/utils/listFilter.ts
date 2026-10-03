/** Distinct, non-empty values of `pick`, sorted. */
export function uniqueSorted<T>(items: T[], pick: (item: T) => string | undefined | null): string[] {
  return [...new Set(items.map(pick).filter((v): v is string => Boolean(v)))].sort();
}

/** Pill options (value/label/count) for every distinct value of `pick`, counted in one pass. */
export function countOptions<T>(
  items: T[],
  pick: (item: T) => string | undefined | null
): { value: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const v = pick(item);
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.keys()].sort().map((v) => ({ value: v, label: v, count: counts.get(v)! }));
}

/** Case-insensitive substring match of the trimmed query against any field; an empty query matches. */
export function matchesQuery(query: string, ...fields: (string | undefined | null)[]): boolean {
  const q = query.trim().toLowerCase();
  return !q || fields.some((f) => !!f && f.toLowerCase().includes(q));
}

/** Number of active filters: `"ALL"` selections and blank search do not count. */
export function countActiveFilters(search: string, ...selections: string[]): number {
  return (search.trim() !== "" ? 1 : 0) + selections.filter((s) => s !== "ALL").length;
}
