/** Shared logic of the bulk edit dialogs (issue #261): common values and the per-item change list. */
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
