import { derived, get, writable } from 'svelte/store';
import { api } from '#lib/api/client';
import { httpErrorStore } from '#lib/stores/httpErrorStore';
import { isUnlocked } from '#lib/stores/session';
import { workspaceIdStore, workspaceStatusStore } from '#lib/stores/workspaceState';
import { isServerBacked } from '#lib/utils/serverBacked';
import { db } from '#lib/db/db';
import type { QueuedRequest } from '#lib/db/schema';

export type { QueuedRequest };

/** Former localStorage home of the queue; read once and moved into IndexedDB. */
const LEGACY_QUEUE_KEY = 'bg_offline_queue';
const hasIdb = () => typeof indexedDB !== 'undefined' && Boolean(db.offlineQueue);

/** In-memory mirror for synchronous readers; IndexedDB (`db.offlineQueue`) is what survives a reload. */
export const offlineQueue = writable<QueuedRequest[]>([]);

/** What IndexedDB holds, as this tab last wrote or read it; object identity tells changed entries apart. */
let persisted = new Map<string, QueuedRequest>();
let persisting: Promise<void> = Promise.resolve();

async function persist(queue: QueuedRequest[]): Promise<void> {
  if (!hasIdb()) return;
  const ids = new Set(queue.map((req) => req.id));
  const removed = [...persisted.keys()].filter((id) => !ids.has(id));
  const changed = queue.filter((req) => persisted.get(req.id) !== req);
  if (removed.length === 0 && changed.length === 0) return;
  try {
    await db.transaction('rw', db.offlineQueue, async () => {
      await db.offlineQueue.bulkDelete(removed);
      await db.offlineQueue.bulkPut(changed);
    });
    persisted = new Map(queue.map((req) => [req.id, req]));
  } catch (err) {
    // Storage full: the writes stay queued in this tab, they just do not survive a reload.
    console.warn('[offlineQueue] Could not persist queued writes:', err);
  }
}

/** Re-reads the stored queue: entries another tab replayed disappear here too, entries only this tab holds (never persisted) stay, and the legacy localStorage queue moves in once. */
async function hydrate(): Promise<void> {
  let legacy: QueuedRequest[] = [];
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_QUEUE_KEY) ?? '[]');
  } catch {
    legacy = [];
  }
  const stored = hasIdb() ? await db.offlineQueue.toArray().catch(() => null) : null;
  if (stored === null && legacy.length === 0) return;
  const before = persisted;
  if (stored) persisted = new Map(stored.map((req) => [req.id, req]));
  offlineQueue.update((q) => {
    const onlyHere = q.filter((req) => !before.has(req.id) && !persisted.has(req.id));
    const byId = new Map([...legacy, ...(stored ?? q), ...onlyHere].map((req) => [req.id, req]));
    return [...byId.values()].sort((a, b) => a.timestamp - b.timestamp);
  });
  await persisting;
  if (legacy.length > 0) localStorage.removeItem(LEGACY_QUEUE_KEY);
}

if (typeof window !== 'undefined') {
  offlineQueue.subscribe((queue) => {
    persisting = persisting.then(() => persist(queue));
  });
  void hydrate();
}

let lastTimestamp = 0;

export function enqueueRequest(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: any,
  headers?: Record<string, string>
): void {
  lastTimestamp = Math.max(Date.now(), lastTimestamp + 1);
  const req: QueuedRequest = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    url,
    method,
    body,
    ...(headers ? { headers } : {}),
    timestamp: lastTimestamp,
    workspaceId: get(workspaceIdStore) ?? undefined,
  };
  offlineQueue.update((q) => [...q, req]);
}

/** No response, a server-side failure or an explicit "later": a replay can succeed. Any other 4xx is refused again. */
export function isTransientError(err: unknown): boolean {
  const { code, status } = (err ?? {}) as { code?: unknown; status?: unknown };
  if (code === 'ERR_NETWORK') return true;
  return typeof status === 'number' && (status >= 500 || status === 408 || status === 429);
}

/** Fallback for a failed server write: queue it when a replay can succeed. Otherwise report it like a non-silent request and rethrow, so the caller never treats a refused write as saved. */
export function enqueueOrThrow(
  err: unknown,
  url: string,
  method: QueuedRequest['method'],
  body?: unknown,
  headers?: Record<string, string>
): void {
  const { status, message, code } = (err ?? {}) as { status?: unknown; message?: string; code?: string };
  if (method === 'DELETE' && status === 404) return; // already gone: the requested state
  if (!isTransientError(err)) {
    if (typeof status === 'number') httpErrorStore.showError(status, message, code);
    throw err;
  }
  enqueueRequest(url, method, body, headers);
}

/** True when the workspace still has writes waiting for the server. */
export function hasQueuedWrites(workspaceId: string): boolean {
  return get(offlineQueue).some((req) => req.workspaceId === workspaceId);
}

/** Writes waiting for the server in the current workspace (the switch wizard refuses to start over them). */
export const pendingWritesCount = derived([offlineQueue, workspaceIdStore], ([$queue, $id]) =>
  $id ? $queue.filter((req) => req.workspaceId === $id).length : 0
);

/** Binds entries queued before the workspace manifest existed to the workspace just created. */
export function stampUnboundQueueEntries(workspaceId: string): void {
  offlineQueue.update((q) =>
    q.some((req) => !req.workspaceId) ? q.map((req) => ({ ...req, workspaceId: req.workspaceId ?? workspaceId })) : q
  );
}

/** Drops every queued write; called when the workspace they belong to is replaced. */
export function clearOfflineQueue(): void {
  offlineQueue.set([]);
}

/** Queued writes the server refused on replay; dropped (a replay cannot succeed) and shown by the root layout. */
export const rejectedWritesStore = writable<{ count: number; lastMessage: string }>({ count: 0, lastMessage: '' });

type ReplayOutcome = 'keep' | 'applied' | 'rejected';

/** keep: stop here and retry this entry and everything behind it later. */
export function replayOutcome(req: Pick<QueuedRequest, 'method'>, err: unknown): ReplayOutcome {
  const { status, code } = (err ?? {}) as { status?: unknown; code?: unknown };
  if (isTransientError(err) || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 'keep';
  if (typeof status !== 'number' || status === 0) return 'keep';
  // A lapsed session or a sign-in in another tab is not the write's fault: wait for it to be fixed.
  if (status === 401 || (status === 403 && typeof code === 'string' && code.startsWith('ERR_MFA'))) return 'keep';
  // An earlier attempt landed before its response was lost, or the target is already gone.
  if ((req.method === 'POST' && status === 409) || (req.method === 'DELETE' && status === 404)) return 'applied';
  return 'rejected';
}

function send(req: QueuedRequest): Promise<unknown> {
  // Silent: a replay is a background retry, and one modal per queued request would be a wall of dialogs.
  const opts = { silentError: true, headers: req.headers };
  if (req.method === 'POST') return api.post(req.url, req.body, opts);
  if (req.method === 'PUT') return api.put(req.url, req.body, opts);
  if (req.method === 'PATCH') return api.patch(req.url, req.body, opts);
  return api.delete(req.url, opts);
}

/** `needs-choice` too: the owner check passed, and the mode-switch wizard waits for this queue to drain. */
const isFlushable = (state: string) => state === 'ok' || state === 'needs-choice';

async function replay(): Promise<void> {
  // Never replay against a session that isn't fully signed in: `online` fires readily on a tablet, and a sign-in in progress has demoted the access cookie, so replaying would burst 403s for replayable writes.
  if (!get(isUnlocked)) return;
  // Only into the workspace the writes were made in, and only once the session has proven it owns it.
  if (!isServerBacked() || !isFlushable(get(workspaceStatusStore).state)) return;
  const workspaceId = get(workspaceIdStore);
  if (!workspaceId) return;
  // Entries of another workspace stay untouched (never replayed here, dropped when it is replaced).
  const pending = get(offlineQueue).filter((req) => req.workspaceId === workspaceId);
  if (pending.length === 0) return;

  const processed = new Set<string>();
  const rejected: string[] = [];
  try {
    for (const req of pending) {
      if (!get(isUnlocked)) break;
      try {
        await send(req);
      } catch (err) {
        const outcome = replayOutcome(req, err);
        // Keep this request *and everything queued behind it*, in order.
        if (outcome === 'keep') break;
        if (outcome === 'rejected') rejected.push((err as Error)?.message || String(err));
      }
      processed.add(req.id);
    }
  } finally {
    // update(), not set(): writes queued while this ran must survive. Entries another tab queued are not in this tab's `persisted` set, so they are deleted from IndexedDB explicitly.
    offlineQueue.update((q) => q.filter((req) => !processed.has(req.id)));
    if (hasIdb()) await db.offlineQueue.bulkDelete([...processed]).catch(() => {});
  }
  if (rejected.length > 0) {
    rejectedWritesStore.update(({ count }) => ({ count: count + rejected.length, lastMessage: rejected[rejected.length - 1] }));
  }
}

/** One replay per browser (F4): tabs share the stored queue, so two concurrent runs would send entries twice. */
async function replayExclusively(): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.locks) return replay();
  await navigator.locks.request('examance-offline-queue', async () => {
    await hydrate();
    await replay();
  });
}

/** Runs `op` while no tab replays the queue (the replay's own Web Lock), on a freshly read queue, and waits until its rewrites are stored; for the pseudonym re-key (issue #177). Never call `flushOfflineQueue` inside `op`: it waits for this lock. */
export async function withQueueHeld<T>(op: () => Promise<T>): Promise<T> {
  const run = async () => {
    await hydrate();
    const result = await op();
    await persisting;
    return result;
  };
  if (typeof navigator === 'undefined' || !navigator.locks) return run();
  return navigator.locks.request('examance-offline-queue', run);
}

/** Rewrites queued writes in place, keeping their id and order; `next` returns the new url and body, or null to leave an entry. */
export function rewriteQueued(next: (req: QueuedRequest) => Pick<QueuedRequest, 'url' | 'body'> | null): void {
  offlineQueue.update((q) =>
    q.map((req) => {
      const changed = next(req);
      return changed ? { ...req, ...changed } : req;
    })
  );
}

let flushing: Promise<void> | null = null;

/** Replays the current workspace's queued writes in order; concurrent callers share one run. */
export function flushOfflineQueue(): Promise<void> {
  flushing ??= replayExclusively().finally(() => {
    flushing = null;
  });
  return flushing;
}

const FLUSH_INTERVAL_MS = 60_000;
let flushTimer: ReturnType<typeof setInterval> | null = null;

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void flushOfflineQueue();
  });
  // `online` alone misses a server that was down while the network was up: also flush whenever the workspace opens, and periodically while it is open.
  workspaceStatusStore.subscribe(({ state }) => {
    if (isFlushable(state)) {
      flushTimer ??= setInterval(() => {
        if (navigator.onLine) void flushOfflineQueue();
      }, FLUSH_INTERVAL_MS);
      void flushOfflineQueue();
    } else if (flushTimer !== null) {
      clearInterval(flushTimer);
      flushTimer = null;
    }
  });
}
