import { derived, get, writable } from 'svelte/store';
import { api } from '#lib/api/client';
import { isUnlocked } from '#lib/stores/session';
import { workspaceIdStore, workspaceStatusStore } from '#lib/stores/workspaceState';
import { isServerBacked } from '#lib/utils/serverBacked';

export interface QueuedRequest {
  id: string;
  url: string;
    /** PUT serves the per-exercise score endpoint, keyed by (submission, exercise): idempotent, hence safe to replay from the queue. */
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  timestamp: number;
  /**
   * The workspace (`lib/db/workspace.ts`) whose data this write belongs to. Replayed only into that
   * workspace: after a mode switch or under another account the write is meaningless or harmful.
   * Missing on entries from before the manifest; `stampUnboundQueueEntries` adopts those once.
   */
  workspaceId?: string;
}

const QUEUE_KEY = 'bg_offline_queue';

function getInitialQueue(): QueuedRequest[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export const offlineQueue = writable<QueuedRequest[]>(getInitialQueue());

offlineQueue.subscribe((val) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(val));
  }
});

export function enqueueRequest(
  url: string,
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  body?: any
): void {
  const req: QueuedRequest = {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    url,
    method,
    body,
    timestamp: Date.now(),
    workspaceId: get(workspaceIdStore) ?? undefined,
  };
  offlineQueue.update((q) => [...q, req]);
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

let isFlushing = false;

export async function flushOfflineQueue(): Promise<void> {
  if (isFlushing) return;
    // Never replay against a session that isn't fully signed in: `online` fires readily on a tablet, and a
    // sign-in in progress has demoted the access cookie, so replaying would burst 403s for replayable writes.
  if (!get(isUnlocked)) return;
    // Only into the workspace the writes were made in, and only while it is a server-backed one the
    // session owns: a queue replayed after a switch to all-local leaked local work back to the server.
  if (!isServerBacked() || get(workspaceStatusStore).state !== 'ok') return;
  const workspaceId = get(workspaceIdStore);
  if (!workspaceId) return;
  isFlushing = true;
  try {
    let currentQueue: QueuedRequest[] = [];
    offlineQueue.subscribe((q) => (currentQueue = q))();

    // Entries of another workspace stay untouched (never replayed here, dropped when it is replaced).
    const foreign = currentQueue.filter((req) => req.workspaceId !== workspaceId);
    currentQueue = currentQueue.filter((req) => req.workspaceId === workspaceId);
    if (currentQueue.length === 0) return;

    const remaining: QueuedRequest[] = [...foreign];
        // silentError throughout: a replay is a background retry; a 409 for a record that already reached the
        // server is expected, and a global error modal per queued request would be a wall of dialogs.
    for (let i = 0; i < currentQueue.length; i++) {
      const req = currentQueue[i];
      try {
        if (req.method === 'POST') {
          await api.post(req.url, req.body, { silentError: true });
        } else if (req.method === 'PUT') {
          await api.put(req.url, req.body, { silentError: true });
        } else if (req.method === 'PATCH') {
          await api.patch(req.url, req.body, { silentError: true });
        } else if (req.method === 'DELETE') {
          await api.delete(req.url, { silentError: true });
        }
      } catch (err: any) {
        if (err?.code === 'ERR_NETWORK' || (typeof navigator !== 'undefined' && !navigator.onLine)) {
          // Still offline: keep this request *and everything queued behind it*.
          // Dropping the tail here silently lost writes the user had made.
          remaining.push(...currentQueue.slice(i));
          break;
        }
      }
    }
    offlineQueue.set(remaining);
  } finally {
    isFlushing = false;
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    flushOfflineQueue();
  });
}
