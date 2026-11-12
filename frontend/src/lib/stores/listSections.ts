import { writable } from 'svelte/store';
import { safeLocalStorage } from '#lib/utils/storage';

/** Open/closed state of the overview-list sections (issue #252), per browser; keys are `<list>:<section>`, absent = the section's default. */
const KEY = 'bg_list_sections';

function read(): Record<string, boolean> {
  try {
    const parsed: unknown = JSON.parse(safeLocalStorage.getItem(KEY) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'boolean')) as Record<string, boolean>;
  } catch {
    return {};
  }
}

export const sectionOpenState = writable<Record<string, boolean>>(read());

export function setSectionOpen(key: string, open: boolean): void {
  sectionOpenState.update((state) => {
    const next = { ...state, [key]: open };
    safeLocalStorage.setItem(KEY, JSON.stringify(next));
    return next;
  });
}
