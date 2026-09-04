import { safeLocalStorage } from './storage';

const PREFIX = 'bg_recent:';

function cleanRecentValue(fieldKey: string, val: string): string {
  const trimmed = val.trim();
  if (fieldKey === 'backend.url') {
    return trimmed.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
  }
  return trimmed;
}

/**
 * Retrieves the stored list of recent values for a given field key.
 */
export function getRecentValues(fieldKey: string): string[] {
  if (!fieldKey) return [];
  const raw = safeLocalStorage.getItem(PREFIX + fieldKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const items = parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      if (fieldKey === 'backend.url') {
        const cleaned = items.map((i) => cleanRecentValue(fieldKey, i)).filter(Boolean);
        return Array.from(new Set(cleaned));
      }
      return items;
    }
  } catch {
    // Ignore corrupt storage entries
  }
  return [];
}

/**
 * Adds a new value to the top of recent values for a given field key.
 * Removes duplicate occurrences, caps array at maxItems, and persists to localStorage.
 */
export function recordValue(fieldKey: string, value: string, maxItems = 15): string[] {
  if (!fieldKey) return [];
  const cleaned = cleanRecentValue(fieldKey, value);
  if (!cleaned) {
    return getRecentValues(fieldKey);
  }

  const existing = getRecentValues(fieldKey);
  // Filter out existing entries that match the new value (case-insensitive)
  const filtered = existing.filter((item) => item.trim().toLowerCase() !== cleaned.toLowerCase());
  const updated = [cleaned, ...filtered].slice(0, maxItems);

  safeLocalStorage.setItem(PREFIX + fieldKey, JSON.stringify(updated));
  return updated;
}

/**
 * Removes a specific value from stored recent values for a given field key.
 */
export function removeValue(fieldKey: string, value: string): string[] {
  if (!fieldKey) return [];
  const cleaned = cleanRecentValue(fieldKey, value);
  if (!cleaned) {
    return getRecentValues(fieldKey);
  }

  const existing = getRecentValues(fieldKey);
  const updated = existing.filter((item) => item.trim().toLowerCase() !== cleaned.toLowerCase());

  if (updated.length === 0) {
    safeLocalStorage.removeItem(PREFIX + fieldKey);
  } else {
    safeLocalStorage.setItem(PREFIX + fieldKey, JSON.stringify(updated));
  }
  return updated;
}

/**
 * Clears stored recent values for a specific field key.
 */
export function clearRecentValues(fieldKey: string): void {
  if (!fieldKey) return;
  safeLocalStorage.removeItem(PREFIX + fieldKey);
}
