/** Runs one task per key at a time: a call while the key's task is in flight gets the same promise, so two quick saves never create the same record twice. A settled task is dropped, so a failure can be retried. */
export function createKeyedOnce<V>(): { run(key: string, task: () => Promise<V>): Promise<V> } {
  const inFlight = new Map<string, Promise<V>>();
  return {
    run(key, task) {
      const running = inFlight.get(key);
      if (running) return running;
      const started = task().finally(() => inFlight.delete(key));
      inFlight.set(key, started);
      return started;
    },
  };
}
