import { writable, derived } from 'svelte/store';
import { safeLocalStorage } from '$lib/utils/storage';
import { t, translate } from '$lib/i18n';

export type StorageMode = 'all-server' | 'all-local' | 'hybrid';

export interface StoragePolicy {
    storageMode: StorageMode;
    latexCompilation: 'server' | 'local';
}

const STORAGE_KEY = 'bg_storage_policy';

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
        setPolicy(policy: StoragePolicy) {
            safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(policy));
            set(policy);
        },
        updateSetting<K extends keyof StoragePolicy>(key: K, value: StoragePolicy[K]) {
            update((current) => {
                const next = { ...current, [key]: value };
                safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify(next));
                return next;
            });
        }
    };
}

export const storagePolicyStore = createStoragePolicyStore();

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

