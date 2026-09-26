import { writable, derived, get } from 'svelte/store';
import { safeLocalStorage } from '$lib/utils/storage';
import { t, translate } from '$lib/i18n';

export type StorageMode = 'all-server' | 'all-local' | 'hybrid';

export interface StoragePolicy {
    storageMode: StorageMode;
    latexCompilation: 'server' | 'local';
}

const STORAGE_KEY = 'bg_storage_policy';

/**
 * Changing the storage mode changes which store every repository talks to,
 * and the data does not follow. Switching is gated: it goes through
 * `services/storageModeSwitch.ts`, which forces an archive export first and
 * is the only holder of a valid token. `updateSetting` is narrowed to
 * `latexCompilation` so any other caller is a compile error.
 */
let activeSwitchToken: string | null = null;

/** Called by the switch service when it begins a gated mode change. */
export function armStorageModeSwitch(): string {
  activeSwitchToken = crypto.randomUUID();
  return activeSwitchToken;
}

/** Called by the switch service once the change is committed or abandoned. */
export function disarmStorageModeSwitch(): void {
  activeSwitchToken = null;
}

export const DEFAULT_POLICY: StoragePolicy = {
    storageMode: 'all-local',
    latexCompilation: 'local',
};

export function getStoragePolicyLabel(policy: StoragePolicy): string {
    const modeLabel = policy.storageMode === 'all-server'
        ? translate('storagePolicy.allServer')
        : policy.storageMode === 'all-local'
            ? translate('storagePolicy.allLocal')
            : translate('storagePolicy.hybrid');
    const latexLabel = policy.latexCompilation === 'server'
        ? translate('storagePolicy.latexServer')
        : translate('storagePolicy.latexLocal');
    return `${modeLabel} | ${latexLabel}`;
}

export function getStoragePolicyBadge(policy: StoragePolicy): { icon: string; text: string; title: string } {
    if (policy.storageMode === 'all-local') {
        return {
            icon: '🛡️',
            text: translate('storagePolicy.allLocal'),
            title: translate('storagePolicy.allLocalTitle'),
        };
    } else if (policy.storageMode === 'all-server') {
        return {
            icon: '☁️',
            text: translate('storagePolicy.allServer'),
            title: translate('storagePolicy.allServerTitle'),
        };
    } else {
        return {
            icon: '🔀',
            text: translate('storagePolicy.hybridShort'),
            title: translate('storagePolicy.hybridTitle'),
        };
    }
}

function getInitialPolicy(): StoragePolicy {
    const saved = safeLocalStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            let storageMode: StorageMode = DEFAULT_POLICY.storageMode;
            let latexCompilation: 'server' | 'local' = DEFAULT_POLICY.latexCompilation;

            if (parsed.storageMode === 'all-server' || parsed.storageMode === 'all-local' || parsed.storageMode === 'hybrid') {
                storageMode = parsed.storageMode;
            } else if (parsed.examAndExerciseStorage === 'server' && parsed.resultsAndStudentsData === 'server') {
                storageMode = 'all-server';
            } else if (parsed.examAndExerciseStorage === 'server' && parsed.resultsAndStudentsData === 'local') {
                storageMode = 'hybrid';
            }

            if (parsed.latexCompilation === 'server' || parsed.latexCompilation === 'local') {
                latexCompilation = parsed.latexCompilation;
            }

            return { storageMode, latexCompilation };
        } catch {
            return DEFAULT_POLICY;
        }
    }
    return DEFAULT_POLICY;
}

function createStoragePolicyStore() {
    const { subscribe, set, update } = writable<StoragePolicy>(getInitialPolicy());

    return {
        subscribe,
        /** Replaces the whole policy. Tests and first-run seeding only. */
        setPolicy(policy: StoragePolicy) {
            safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
            set(policy);
        },

        /**
         * Everything except the storage mode. `storageMode` is deliberately not
         * assignable here — see `armStorageModeSwitch` above.
         */
        updateSetting<K extends 'latexCompilation'>(key: K, value: StoragePolicy[K]) {
            update((current) => {
                const next = { ...current, [key]: value };
                safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                return next;
            });
        },

        /**
         * Sets the storage mode. Only reachable from an armed switch, so a mode
         * change always has an export behind it.
         *
         * @throws if `token` is not the one the switch service is holding.
         */
        commitStorageMode(mode: StorageMode, token: string) {
            if (!activeSwitchToken || token !== activeSwitchToken) {
                throw new Error(
                    'Refusing to change the storage mode outside a gated switch. ' +
                        'Use services/storageModeSwitch.ts, which exports the workspace first.'
                );
            }
            update((current) => {
                const next = { ...current, storageMode: mode };
                safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                return next;
            });
        }
    };
}

export const storagePolicyStore = createStoragePolicyStore();

/**
 * True when grading results — students, submissions, scores — live in
 * IndexedDB. `hybrid` keeps them local by design; only `all-server` does not.
 */
export function resultsAreLocal(): boolean {
    return get(storagePolicyStore).storageMode !== 'all-server';
}

// `t` is a dependency so switching language re-renders these labels; the
// translated text itself is read imperatively inside the getters.
export const storagePolicyLabelStore = derived(
    [storagePolicyStore, t],
    ([$policy]) => getStoragePolicyLabel($policy)
);

export const storagePolicyBadgeStore = derived(
    [storagePolicyStore, t],
    ([$policy]) => getStoragePolicyBadge($policy)
);

