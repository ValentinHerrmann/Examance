/** Shared logic of the bulk edit dialogs (issue #261): common values, the per-item change list and the package additions. */
import { entriesError, type EntryError, type LatexPackageEntry } from '#lib/latex/packages';

export interface BulkField {
  key: string;
  label: string;
  /** Previously used values (`utils/recentValues`) offered while typing. */
  storageKey?: string;
  suggestions?: string[];
  maxlength?: number;
  placeholder?: string;
  multiline?: boolean;
}

export interface BulkItem {
  id: string;
  title: string;
  /** The item's current value per field key; a missing value is "". */
  values: Record<string, string | undefined>;
}

export interface FieldChange {
  key: string;
  from: string;
  to: string;
}

const valueOf = (item: BulkItem, key: string) => (item.values[key] ?? '').trim();

/** The value every item shares, or null when they differ ("various values"). */
export function commonValue(items: readonly BulkItem[], key: string): string | null {
  if (items.length === 0) return '';
  const first = valueOf(items[0], key);
  return items.every((item) => valueOf(item, key) === first) ? first : null;
}

/** Per item, the fields `patch` really changes (only touched fields are in `patch`; "" clears). */
export function bulkChanges(items: readonly BulkItem[], patch: Readonly<Record<string, string>>): { item: BulkItem; changes: FieldChange[] }[] {
  return items.map((item) => ({
    item,
    changes: Object.entries(patch)
      .map(([key, to]) => ({ key, from: valueOf(item, key), to: to.trim() }))
      .filter((c) => c.from !== c.to),
  }));
}

const entryKey = (e: LatexPackageEntry) => `${e.kind}:${e.name}`;

/** An exam's package list with `added` merged in: a same-named entry (also a left-out account package) is replaced. Null `existing` follows the account, so the result holds just the additions. */
export function addPackages(
  existing: readonly LatexPackageEntry[] | null | undefined,
  added: readonly LatexPackageEntry[],
): { entries: LatexPackageEntry[]; error: EntryError | null } {
  const keys = new Set(added.map(entryKey));
  const entries = [...(existing ?? []).filter((e) => !keys.has(entryKey(e))), ...added.map((e) => ({ kind: e.kind, name: e.name, options: e.options }))];
  return { entries, error: entriesError(entries) };
}
