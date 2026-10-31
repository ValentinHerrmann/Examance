import type { ExerciseRecord } from "#lib/db/schema";

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

/** Pill options counted over `items` that already passed every other filter, so a pill never shows (0). The selected value stays listed with 0 when nothing matches, or it could not be deselected. */
export function facetOptions<T>(
  items: T[],
  pick: (item: T) => string | undefined | null,
  selected: string
): { value: string; label: string; count: number }[] {
  const options = countOptions(items, pick);
  if (selected !== "ALL" && !options.some((o) => o.value === selected)) {
    options.push({ value: selected, label: selected, count: 0 });
    options.sort((a, b) => a.value.localeCompare(b.value));
  }
  return options;
}

/** Case-insensitive substring match of the trimmed query against any field; an empty query matches. */
export function matchesQuery(query: string, ...fields: (string | undefined | null)[]): boolean {
  const q = query.trim().toLowerCase();
  return !q || fields.some((f) => !!f && f.toLowerCase().includes(q));
}

/** Exercise-library filter shared by the library page and the exam page's picker: grade, subject and search (everything but the topic, which is a facet). The picker also searches the variant key. */
export function matchesExerciseFilters(
  ex: Pick<ExerciseRecord, "name" | "topicTag" | "grade" | "subject" | "latexBody" | "variantKey">,
  filters: { query: string; grade: string; subject: string },
  searchVariantKey = false
): boolean {
  return (
    (filters.grade === "ALL" || ex.grade === filters.grade) &&
    (filters.subject === "ALL" || ex.subject === filters.subject) &&
    matchesQuery(filters.query, ex.name, ex.topicTag, ex.grade, ex.subject, searchVariantKey ? ex.variantKey : null, ex.latexBody)
  );
}

/** Number of active filters: `"ALL"` selections and blank search do not count. */
export function countActiveFilters(search: string, ...selections: string[]): number {
  return (search.trim() !== "" ? 1 : 0) + selections.filter((s) => s !== "ALL").length;
}
