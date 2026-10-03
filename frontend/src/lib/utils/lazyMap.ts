import { writable, type Readable } from "svelte/store";

export type LazyEntry<V> = { status: "loading" } | { status: "ready"; value: V } | { status: "error" };

export interface LazyMap<V> extends Readable<Map<string, LazyEntry<V>>> {
  /** Starts loading `key` unless it is already loading, loaded or failed. */
  ensure(key: string): void;
  /** Loads `key` again, replacing a failed or stale entry. */
  reload(key: string): void;
  /** Drops every entry; results still in flight are ignored. */
  reset(): void;
}

/**
 * Per-key lazy loading for expandable lists (e.g. the exercises of an exam,
 * the exams using an exercise). A failed load is recorded as `error` — never as
 * an empty value, which would read as "nothing found". `reset()` bumps a
 * generation so a request started before it cannot write into the new map.
 */
export function createLazyMap<V>(loader: (key: string) => Promise<V>): LazyMap<V> {
  const store = writable(new Map<string, LazyEntry<V>>());
  let entries = new Map<string, LazyEntry<V>>();
  let generation = 0;

  function put(key: string, entry: LazyEntry<V>) {
    entries = new Map(entries).set(key, entry);
    store.set(entries);
  }

  function load(key: string) {
    const gen = generation;
    put(key, { status: "loading" });
    loader(key).then(
      (value) => gen === generation && put(key, { status: "ready", value }),
      (err) => {
        console.warn(`Lazy load failed for ${key}:`, err);
        if (gen === generation) put(key, { status: "error" });
      }
    );
  }

  return {
    subscribe: store.subscribe,
    ensure: (key) => {
      if (!entries.has(key)) load(key);
    },
    reload: load,
    reset: () => {
      generation++;
      entries = new Map();
      store.set(entries);
    },
  };
}
