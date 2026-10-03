import { get, writable } from 'svelte/store';
import { api } from '#lib/api/client';
import { isUnlocked } from '#lib/stores/session';

export interface QueuedRequest {
  id: string;
  url: string;
    /** PUT serves the per-exercise score endpoint, keyed by (submission, exercise): idempotent, hence safe to replay from the queue. */
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: any;
  timestamp: number;
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
  };
  offlineQueue.update((q) => [...q, req]);
}

let isFlushing = false;

export async function flushOfflineQueue(): Promise<void> {
  if (isFlushing) return;
    // Never replay against a session that isn't fully signed in: `online` fires readily on a tablet, and a
    // sign-in in progress has demoted the access cookie, so replaying would burst 403s for replayable writes.
  if (!get(isUnlocked)) return;
  isFlushing = true;
  try {
    let currentQueue: QueuedRequest[] = [];
    offlineQueue.subscribe((q) => (currentQueue = q))();

    if (currentQueue.length === 0) return;

    const remaining: QueuedRequest[] = [];
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
