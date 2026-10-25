import { derived, get, writable, type Readable } from 'svelte/store';
import { effectiveBackendStore } from '#lib/stores/backendStore';

/**
 * Maintenance and deployment windows (issue #130), polled from the public GET /api/v1/maintenance.
 * A passive probe like refreshBackendVersion: bare fetch, never the HTTP error modal; a failed poll keeps
 * the last known window (the backend is unreachable exactly while it restarts).
 */

export type MaintenancePhase = 'none' | 'scheduled' | 'warning' | 'final' | 'down';
export type DowntimeClass = 'very_short' | 'short' | 'long' | 'unspecific';

export interface MaintenanceStatus {
  phase: MaintenancePhase;
  kind: 'manual' | 'deployment' | null;
  downtime_class: DowntimeClass | null;
  revision: number | null;
  first_warning_at: string | null;
  second_warning_at: string | null;
  starts_at: string | null;
  server_time: string;
}

interface MaintenanceState {
  status: MaintenanceStatus | null;
  /** Server clock minus local clock, so countdowns do not depend on the device's time. */
  offsetMs: number;
  reachable: boolean;
}

export const maintenanceStore = writable<MaintenanceState>({ status: null, offsetMs: 0, reachable: true });

/** Server-adjusted "now", ticking once a second only while a window is open. */
const clock = writable(Date.now());
let ticker: ReturnType<typeof setInterval> | null = null;

function isOpen(status: MaintenanceStatus | null): boolean {
  return status !== null && status.phase !== 'none';
}

function syncTicker(status: MaintenanceStatus | null): void {
  if (isOpen(status) && ticker === null) {
    ticker = setInterval(() => clock.set(Date.now()), 1000);
  } else if (!isOpen(status) && ticker !== null) {
    clearInterval(ticker);
    ticker = null;
  }
  clock.set(Date.now());
}

/** The phase as of now, moved forward locally between polls (mirrors backend/app/services/maintenance.py). */
export function phaseAt(status: MaintenanceStatus | null, nowMs: number): MaintenancePhase {
  if (!status || status.phase === 'none' || status.phase === 'down') return status?.phase ?? 'none';
  const at = (iso: string | null) => (iso ? Date.parse(iso) : Number.POSITIVE_INFINITY);
  // A deployment is down only once CI froze it; the server reports that.
  if (status.kind === 'manual' && nowMs >= at(status.starts_at)) return 'down';
  if (nowMs >= at(status.second_warning_at)) return 'final';
  if (nowMs >= at(status.first_warning_at)) return 'warning';
  return 'scheduled';
}

export const maintenancePhase: Readable<MaintenancePhase> = derived(
  [maintenanceStore, clock],
  ([$m, $now]) => phaseAt($m.status, $now + $m.offsetMs),
);

/** Seconds until the announced start (0 once it passed), or null without a window. */
export const secondsToStart: Readable<number | null> = derived([maintenanceStore, clock], ([$m, $now]) => {
  if (!isOpen($m.status) || !$m.status?.starts_at) return null;
  return Math.max(0, Math.ceil((Date.parse($m.status.starts_at) - ($now + $m.offsetMs)) / 1000));
});

let inFlight: Promise<void> | null = null;

export function refreshMaintenance(): Promise<void> {
  const origin = get(effectiveBackendStore);
  if (!origin) return Promise.resolve();
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      const sentAt = Date.now();
      const response = await fetch(`${origin}/api/v1/maintenance`, { credentials: 'include' });
      if (response.status === 404) {
        // A backend older than this feature: no maintenance announcements.
        maintenanceStore.set({ status: null, offsetMs: 0, reachable: true });
        syncTicker(null);
        return;
      }
      if (!response.ok) throw new Error(String(response.status));
      const status = (await response.json()) as MaintenanceStatus;
      const offsetMs = Date.parse(status.server_time) - (sentAt + Date.now()) / 2;
      maintenanceStore.set({ status, offsetMs: Number.isFinite(offsetMs) ? offsetMs : 0, reachable: true });
      syncTicker(status);
    } catch {
      maintenanceStore.update((m) => ({ ...m, reachable: false }));
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

let lastHeaderRefresh = 0;

/** API responses carry the open window's revision; refetch when it is news (absent header = unknown). */
export function noteMaintenanceRevision(header: string | null): void {
  const revision = header === null ? Number.NaN : Number(header);
  if (!Number.isInteger(revision)) return;
  const { status } = get(maintenanceStore);
  if (isOpen(status) && status?.revision === revision) return;
  if (Date.now() - lastHeaderRefresh < 2_000) return;
  lastHeaderRefresh = Date.now();
  void refreshMaintenance();
}

function pollDelayMs(): number {
  const { status, reachable } = get(maintenanceStore);
  // 15 s idle: a preview window lasts only 30 s, and background tabs are throttled anyway.
  if (!isOpen(status)) return 15_000;
  if (status?.phase === 'down' || !reachable) return 5_000;
  return 10_000;
}

/** Start polling (root layout); returns the stop function. */
export function startMaintenancePolling(): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const loop = async () => {
    await refreshMaintenance();
    if (!stopped) timer = setTimeout(loop, pollDelayMs());
  };
  void loop();
  return () => {
    stopped = true;
    if (timer !== null) clearTimeout(timer);
  };
}
