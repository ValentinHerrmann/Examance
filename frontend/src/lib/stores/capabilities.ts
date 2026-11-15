/** What the account may use, as the server decides it (`GET /user/capabilities`): storage mode, allowed modes, features. Render every such option from this store, never from hard-coded lists. Per-account admin switches: issues #53, #65. */

import { derived, get, writable } from 'svelte/store';
import { api } from '#lib/api/client';
import { sessionStore } from '#lib/stores/session';
import { isStorageMode, storagePolicyStore, type StorageMode } from '#lib/stores/storagePolicy';
import { safeSessionStorage } from '#lib/utils/storage';

export type FeatureName = 'server_results' | 'server_latex' | 'exercise_sharing' | 'result_delivery' | 'result_mail' | 'result_bounces' | 'training_donation';

export interface Capabilities {
  /** The account the answer is about; null in a cache written before the server sent it. */
  accountId: string | null;
  storageMode: StorageMode | null;
  allowedStorageModes: StorageMode[];
  features: Partial<Record<FeatureName, boolean>>;
  /** The teacher paused their own exercise sharing (issue #65). */
  sharingPaused?: boolean;
  /** Remembered answer to the share question after saving (issue #263): null asks, true always shares, false never. */
  shareNewExercises?: boolean | null;
  /** Mail on a student's objection (issue #226): null and true send, false does not. */
  reviewMail?: boolean | null;
}

const CACHE_KEY = 'bg_capabilities';

/** The account this tab is signed in as, from the sign-in response. */
function sessionAccountId(): string | null {
  return get(sessionStore).teacherId ?? null;
}

function readCache(): Capabilities | null {
  try {
    return JSON.parse(safeSessionStorage.getItem(CACHE_KEY) ?? 'null');
  } catch {
    return null;
  }
}

/** The server answered for a different account than this tab is signed in as. The access cookie is shared by every tab of the browser, so signing in as someone else in another tab swaps the account under this one. The tab must lock rather than show (or write) another account's data. */
export class AccountMismatchError extends Error {
  constructor() {
    super('The server session belongs to a different account than this tab.');
    this.name = 'AccountMismatchError';
  }
}

/** Null until loaded (or while signed out). Cached per tab so a reload offline still knows the answer; the cache is read back through `cachedCapabilities()` once the session (and so the account) is known. */
export const capabilitiesStore = writable<Capabilities | null>(null);
capabilitiesStore.subscribe((value) => {
  if (value) safeSessionStorage.setItem(CACHE_KEY, JSON.stringify(value));
});

/** This tab's last answer, only if it is about this tab's account: another account's switches never apply. */
export function cachedCapabilities(): Capabilities | null {
  const account = sessionAccountId();
  const mine = (caps: Capabilities | null) => (account && caps?.accountId === account ? caps : null);
  return mine(get(capabilitiesStore)) ?? mine(readCache());
}

interface CapabilitiesResponse {
  account_id: string;
  storage_mode: string | null;
  allowed_storage_modes: string[];
  features: Record<string, boolean>;
  sharing_paused?: boolean;
  share_new_exercises?: boolean | null;
  review_mail?: boolean | null;
}

function fromResponse(res: CapabilitiesResponse): Capabilities {
  const account = sessionAccountId();
  if (account && res.account_id && res.account_id !== account) throw new AccountMismatchError();
  return {
    accountId: res.account_id ?? null,
    storageMode: isStorageMode(res.storage_mode) ? res.storage_mode : null,
    allowedStorageModes: res.allowed_storage_modes.filter(isStorageMode),
    features: res.features as Capabilities['features'],
    sharingPaused: res.sharing_paused === true,
    shareNewExercises: typeof res.share_new_exercises === 'boolean' ? res.share_new_exercises : null,
    reviewMail: typeof res.review_mail === 'boolean' ? res.review_mail : null,
  };
}

/**
 * Fetches the account's capabilities; runs at every unlock and whenever the tab refocuses (`lib/db/workspace.ts`).
 * @throws on network or auth failure (callers fall back to the cache), `AccountMismatchError` when the server
 * session belongs to another account.
 */
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

/** Reflects a pause/resume made by this tab without refetching. */
export function markSharingPaused(paused: boolean): void {
  capabilitiesStore.update((caps) => (caps ? { ...caps, sharingPaused: paused } : caps));
}

/** Reflects a changed share default made by this tab without refetching. */
export function markShareDefault(value: boolean | null): void {
  capabilitiesStore.update((caps) => (caps ? { ...caps, shareNewExercises: value } : caps));
}

/** Switches the mail on a student's objection (issue #226); the server answers with the capabilities. */
export async function saveReviewMail(value: boolean | null): Promise<Capabilities> {
  const caps = fromResponse(await api.put<CapabilitiesResponse>('/user/review-mail', { review_mail: value }, { silentError: true }));
  capabilitiesStore.set(caps);
  return caps;
}

/** Forgets the answer, e.g. at sign-out: the next account must never start from this one's switches. */
export function clearCapabilities(): void {
  capabilitiesStore.set(null);
  safeSessionStorage.removeItem(CACHE_KEY);
}

/** Storage modes an account with these capabilities may choose. */
export function allowedModesFrom(caps: Capabilities | null): StorageMode[] {
  return caps?.allowedStorageModes ?? [];
}

function featuresFrom(caps: Capabilities | null): Partial<Record<FeatureName, boolean>> {
  return caps?.features ?? {};
}

/** Storage modes this account may choose. */
export const allowedStorageModes = derived(capabilitiesStore, ($c) => allowedModesFrom($c));

/** Whether this account may use a server feature. */
export function featureEnabled(name: FeatureName): boolean {
  return featuresFrom(get(capabilitiesStore))[name] === true;
}

export const featuresStore = derived(capabilitiesStore, ($c) => featuresFrom($c));

/** The LaTeX engine actually used: the browser's preference, unless this account may not compile on the server. Every compile call site chooses its engine through this, never through the raw preference. */
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
