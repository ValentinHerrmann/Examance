import { writable, derived, get } from 'svelte/store';
import { safeLocalStorage } from '#lib/utils/storage';
import { t, translate } from '#lib/i18n';

export type StorageMode = 'all-server' | 'all-local' | 'hybrid';

export interface StoragePolicy {
    storageMode: StorageMode;
    latexCompilation: 'server' | 'local';
}

/**
 * Synchronous boot cache of the storage mode. The authoritative copy is the workspace manifest inside
 * IndexedDB (`lib/db/workspace.ts`), which rewrites this cache on load; the two can never disagree for
 * longer than the first `loadWorkspace()` of a page.
 */
const STORAGE_KEY = 'bg_storage_policy';
/**
 * The LaTeX engine has its own key: it used to share `bg_storage_policy`, and a tab still holding the
 * previous mode in memory wrote that stale mode back whenever it changed the engine.
 */
const LATEX_KEY = 'bg_latex_compilation';

/**
 * Changing the storage mode changes which store every repository uses, and data doesn't follow. The
 * mode is therefore only settable through `commitStorageMode` with a token from
 * `armStorageModeSwitch`, which only `lib/db/workspace.ts` calls (when it loads or replaces the
 * manifest); `updateSetting` is narrowed to `latexCompilation` so any other caller is a compile error.
 */
let activeSwitchToken: string | null = null;

/** Called by the workspace layer right before it commits a mode it has stamped into the manifest. */
export function armStorageModeSwitch(): string {
  activeSwitchToken = crypto.randomUUID();
  return activeSwitchToken;
}

/** Called once the change is committed or abandoned. */
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

export function getStoragePolicyBadge(policy: StoragePolicy): { text: string; title: string } {
    if (policy.storageMode === 'all-local') {
        return {
            text: translate('storagePolicy.allLocal'),
            title: translate('storagePolicy.allLocalTitle'),
        };
    } else if (policy.storageMode === 'all-server') {
        return {
            text: translate('storagePolicy.allServer'),
            title: translate('storagePolicy.allServerTitle'),
        };
    } else {
        return {
            text: translate('storagePolicy.hybridShort'),
            title: translate('storagePolicy.hybridTitle'),
        };
    }
}

function parseLatex(value: unknown): 'server' | 'local' | null {
    return value === 'server' || value === 'local' ? value : null;
}

function getInitialPolicy(): StoragePolicy {
    let storageMode: StorageMode = DEFAULT_POLICY.storageMode;
    let legacyLatex: 'server' | 'local' | null = null;
    const saved = safeLocalStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.storageMode === 'all-server' || parsed.storageMode === 'all-local' || parsed.storageMode === 'hybrid') {
                storageMode = parsed.storageMode;
            } else if (parsed.examAndExerciseStorage === 'server' && parsed.resultsAndStudentsData === 'server') {
                storageMode = 'all-server';
            } else if (parsed.examAndExerciseStorage === 'server' && parsed.resultsAndStudentsData === 'local') {
                storageMode = 'hybrid';
            }
            // Before the engine got its own key it lived in this object; read once as the fallback.
            legacyLatex = parseLatex(parsed.latexCompilation);
        } catch {
            // Unreadable cache: the manifest restores the real mode on load.
        }
    }
    const latexCompilation =
        parseLatex(safeLocalStorage.getItem(LATEX_KEY)) ?? legacyLatex ?? DEFAULT_POLICY.latexCompilation;
    return { storageMode, latexCompilation };
}

/** True when this browser has ever cached a storage mode, i.e. it predates the workspace manifest or a mode was chosen. */
export function hasCachedStorageMode(): boolean {
    return safeLocalStorage.getItem(STORAGE_KEY) !== null;
}

function createStoragePolicyStore() {
    const { subscribe, set, update } = writable<StoragePolicy>(getInitialPolicy());

    // Another tab changed the engine: follow it. Mode changes reload the tab instead (`workspaceSync.ts`).
    if (typeof window !== 'undefined') {
        window.addEventListener('storage', (event) => {
            if (event.key !== LATEX_KEY) return;
            const latexCompilation = parseLatex(event.newValue);
            if (latexCompilation) update((current) => ({ ...current, latexCompilation }));
        });
    }

    return {
        subscribe,
        /** Replaces the whole policy. Tests only. */
        setPolicy(policy: StoragePolicy) {
            safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify({ storageMode: policy.storageMode }));
            safeLocalStorage.setItem(LATEX_KEY, policy.latexCompilation);
            set(policy);
        },

        /** Everything except the storage mode, deliberately not assignable here (see `armStorageModeSwitch`). */
        updateSetting<K extends 'latexCompilation'>(key: K, value: StoragePolicy[K]) {
            safeLocalStorage.setItem(LATEX_KEY, value);
            update((current) => ({ ...current, [key]: value }));
        },

        /** Sets the storage mode; only reachable from the workspace layer, which stamps the mode into the manifest first. @throws if `token` isn't the armed one. */
        commitStorageMode(mode: StorageMode, token: string) {
            if (!activeSwitchToken || token !== activeSwitchToken) {
                throw new Error(
                    'Refusing to change the storage mode outside a gated switch. ' +
                        'Use services/storageModeSwitch.ts, which exports the workspace first.'
                );
            }
            safeLocalStorage.setItem(STORAGE_KEY, JSON.stringify({ storageMode: mode }));
            update((current) => ({ ...current, storageMode: mode }));
        }
    };
}

export const storagePolicyStore = createStoragePolicyStore();

/** True when grading results (students, submissions, scores) live in IndexedDB: `hybrid` keeps them local by design, only `all-server` doesn't. */
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

