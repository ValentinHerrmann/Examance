/**
 * What the signed-in account may use, as the server decides it (`GET /user/capabilities`,
 * `backend/app/services/capabilities.py`): its storage mode, the modes it may choose, and optional
 * server features. Every option the UI offers for these is rendered from this store. An admin sets
 * two switches per account (issue #53): `server_results` (whether `all-server` is among the allowed
 * modes; `hybrid` always is) and `server_latex`. Exams and exercises always live on the server.
 */

import { derived, get, writable } from 'svelte/store';
import { api } from '#lib/api/client';
import { isStorageMode, STORAGE_MODES, storagePolicyStore, type StorageMode } from '#lib/stores/storagePolicy';
import { safeSessionStorage } from '#lib/utils/storage';

export type FeatureName = 'server_results' | 'server_latex' | 'training_donation';

/**
 * Per-account restrictions are enforced: the UI offers only what the capabilities answer allows, and
 * the server refuses the rest (server LaTeX compiles, result writes outside `all-server`). Setting this
 * to false unlocks every mode and feature in the UI again (the server still refuses).
 */
export const ENFORCE_CAPABILITIES = true;

const ALL_FEATURES: Record<FeatureName, boolean> = {
  server_results: true,
  server_latex: true,
  training_donation: true,
};

export interface Capabilities {
  storageMode: StorageMode | null;
  allowedStorageModes: StorageMode[];
  features: Partial<Record<FeatureName, boolean>>;
}

const CACHE_KEY = 'bg_capabilities';

function readCache(): Capabilities | null {
  try {
    return JSON.parse(safeSessionStorage.getItem(CACHE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

/** Null until loaded (or while signed out). Cached per tab so a reload offline still knows the answer. */
export const capabilitiesStore = writable<Capabilities | null>(readCache());
capabilitiesStore.subscribe((value) => {
  if (value) safeSessionStorage.setItem(CACHE_KEY, JSON.stringify(value));
  else safeSessionStorage.removeItem(CACHE_KEY);
});

interface CapabilitiesResponse {
  storage_mode: string | null;
  allowed_storage_modes: string[];
  features: Record<string, boolean>;
}

function fromResponse(res: CapabilitiesResponse): Capabilities {
  return {
    storageMode: isStorageMode(res.storage_mode) ? res.storage_mode : null,
    allowedStorageModes: res.allowed_storage_modes.filter(isStorageMode),
    features: res.features as Capabilities['features'],
  };
}

/** Fetches the account's capabilities. @throws on network or auth failure (callers fall back to the cache). */
export async function loadCapabilities(): Promise<Capabilities> {
  const res = await api.get<CapabilitiesResponse>('/user/capabilities', { silentError: true });
  const caps = fromResponse(res);
  capabilitiesStore.set(caps);
  return caps;
}

/**
 * Records the account's storage mode on the server, compare-and-set on `expected`. Only the results
 * mover calls this, after the results have reached their new home.
 * @throws ApiError 409 when another browser changed the mode meanwhile, 403 when the mode isn't allowed.
 */
export async function saveAccountStorageMode(mode: StorageMode, expected: StorageMode | null): Promise<Capabilities> {
  const res = await api.put<CapabilitiesResponse>('/user/storage-mode', { mode, expected }, { silentError: true });
  const caps = fromResponse(res);
  capabilitiesStore.set(caps);
  return caps;
}

export function clearCapabilities(): void {
  capabilitiesStore.set(null);
}

/** Storage modes an account with these capabilities may choose. */
export function allowedModesFrom(caps: Capabilities | null): StorageMode[] {
  if (!ENFORCE_CAPABILITIES) return [...STORAGE_MODES];
  return caps?.allowedStorageModes ?? [];
}

function featuresFrom(caps: Capabilities | null): Partial<Record<FeatureName, boolean>> {
  if (!ENFORCE_CAPABILITIES) return ALL_FEATURES;
  return caps?.features ?? {};
}

/** Storage modes this account may choose. */
export const allowedStorageModes = derived(capabilitiesStore, ($c) => allowedModesFrom($c));

/** Whether this account may use a server feature. */
export function featureEnabled(name: FeatureName): boolean {
  return featuresFrom(get(capabilitiesStore))[name] === true;
}

export const featuresStore = derived(capabilitiesStore, ($c) => featuresFrom($c));

/**
 * The LaTeX engine actually used: the browser's preference, unless this account may not compile on the
 * server. Every compile call site chooses its engine through this, never through the raw preference.
 */
export function effectiveLatexCompilation(): 'server' | 'local' {
  return get(storagePolicyStore).latexCompilation === 'server' && featureEnabled('server_latex')
    ? 'server'
    : 'local';
}

/** Reactive `effectiveLatexCompilation`, for markup. */
export const effectiveLatexStore = derived(
  [storagePolicyStore, capabilitiesStore],
  ([$policy, $caps]): 'server' | 'local' =>
    $policy.latexCompilation === 'server' && featuresFrom($caps).server_latex === true ? 'server' : 'local',
);
