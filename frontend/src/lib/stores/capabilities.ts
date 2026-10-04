/**
 * What the signed-in account may use, as the server decides it (`GET /user/capabilities`,
 * `backend/app/services/capabilities.py`): its storage mode, the modes it may choose, and optional
 * server features. Every option the UI offers for these is rendered from this store, so an admin
 * switching a feature off for an account later needs no frontend change.
 */

import { derived, get, writable } from 'svelte/store';
import { api } from '#lib/api/client';
import { isStorageMode, type StorageMode } from '#lib/stores/storagePolicy';
import { safeSessionStorage } from '#lib/utils/storage';

export type FeatureName = 'server_latex' | 'training_donation';

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

/** Storage modes this account may choose (empty until loaded). */
export const allowedStorageModes = derived(capabilitiesStore, ($c) => $c?.allowedStorageModes ?? []);

/** A server feature is usable only when the server says so; unknown means off. */
export function featureEnabled(name: FeatureName): boolean {
  return get(capabilitiesStore)?.features[name] === true;
}

export const featuresStore = derived(capabilitiesStore, ($c) => $c?.features ?? {});
