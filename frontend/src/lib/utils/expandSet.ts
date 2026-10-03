import { writable, type Readable } from "svelte/store";

export interface ExpandSet extends Readable<Record<string, boolean>> {
  toggle(id: string): void;
  /** Forgets expanded ids that no longer exist (after a refresh or delete). */
  prune(validIds: Iterable<string>): void;
  /** Currently expanded ids. */
  ids(): string[];
}

/** Which list cards are expanded; `onExpand` fires when a card opens (lazy loading hook). */
export function createExpandSet(onExpand?: (id: string) => void): ExpandSet {
  const store = writable<Record<string, boolean>>({});
  let state: Record<string, boolean> = {};

  function set(next: Record<string, boolean>) {
    state = next;
    store.set(state);
  }

  return {
    subscribe: store.subscribe,
    toggle(id) {
      const open = !state[id];
      set({ ...state, [id]: open });
      if (open) onExpand?.(id);
    },
    prune(validIds) {
      const valid = new Set(validIds);
      set(Object.fromEntries(Object.entries(state).filter(([id]) => valid.has(id))));
    },
    ids: () => Object.keys(state).filter((id) => state[id]),
  };
}
