import { writable, derived, get } from 'svelte/store';
import { safeLocalStorage } from '#lib/utils/storage';
import { t, translate } from '#lib/i18n';

/**
 * Where an account keeps its grading results (docs/dev/storage_modes.md). Exams and exercises always
 * live on the server; `hybrid` keeps students, submissions and scores in one browser only. Which modes
 * an account may choose comes from the server (`lib/stores/capabilities.ts`), never from this list.
 */
export type StorageMode = 'all-server' | 'hybrid';

export const STORAGE_MODES: readonly StorageMode[] = ['all-server', 'hybrid'];

export function isStorageMode(value: unknown): value is StorageMode {
    return value === 'all-server' || value === 'hybrid';
}

export interface StoragePolicy {
    /** The account's mode as the server reported it; null until the account has chosen one. */
    storageMode: StorageMode | null;
    latexCompilation: 'server' | 'local';
}

/**
 * Pre-#47 browsers kept the mode per browser under this key. It is read once, when the workspace
 * manifest is created (`legacyCachedMode`), and then removed; the account's mode lives on the server.
 */
const LEGACY_MODE_KEY = 'bg_storage_policy';
/** The LaTeX engine is a per-browser preference with its own key. */
const LATEX_KEY = 'bg_latex_compilation';

/**
 * The storage mode decides which store every repository uses, so it is only settable via `commitStorageMode` with a token
 * from `armStorageModeSwitch` (only `lib/db/workspace.ts` calls it); `updateSetting` is narrowed to `latexCompilation` so
 * any other caller is a compile error.
 */
let activeSwitchToken: string | null = null;

/** Called by the workspace layer right before it publishes the account's mode. */
export function armStorageModeSwitch(): string {
  activeSwitchToken = crypto.randomUUID();
  return activeSwitchToken;
}

/** Called once the change is committed or abandoned. */
export function disarmStorageModeSwitch(): void {
  activeSwitchToken = null;
}

/** No storage mode by default: every account chooses one explicitly. */
export const DEFAULT_POLICY: StoragePolicy = {
    storageMode: null,
    latexCompilation: 'local',
};

function modeLabel(mode: StorageMode | null): string {
    if (mode === 'all-server') return translate('storagePolicy.allServer');
    if (mode === 'hybrid') return translate('storagePolicy.hybrid');
    return translate('storagePolicy.notChosen');
}

export function getStoragePolicyLabel(policy: StoragePolicy): string {
    const latexLabel = policy.latexCompilation === 'server'
        ? translate('storagePolicy.latexServer')
        : translate('storagePolicy.latexLocal');
    return `${modeLabel(policy.storageMode)} | ${latexLabel}`;
}

export function getStoragePolicyBadge(policy: StoragePolicy): { text: string; title: string } {
    if (policy.storageMode === 'all-server') {
        return {
            text: translate('storagePolicy.allServer'),
            title: translate('storagePolicy.allServerTitle'),
        };
    }
    if (policy.storageMode === 'hybrid') {
        return {
            text: translate('storagePolicy.hybridShort'),
            title: translate('storagePolicy.hybridTitle'),
        };
    }
    return {
        text: translate('storagePolicy.notChosen'),
        title: translate('storagePolicy.notChosenTitle'),
    };
}

function parseLatex(value: unknown): 'server' | 'local' | null {
    return value === 'server' || value === 'local' ? value : null;
}

/**
 * The per-browser mode a pre-#47 browser had cached, for legacy detection only: `'all-local'` when
 * the browser used local mode (the old default, also when nothing was cached). Removes the key.
 */
export function legacyCachedMode(): StorageMode | 'all-local' {
    const saved = safeLocalStorage.getItem(LEGACY_MODE_KEY);
    safeLocalStorage.removeItem(LEGACY_MODE_KEY);
    if (!saved) return 'all-local';
    try {
        const parsed = JSON.parse(saved);
        if (isStorageMode(parsed.storageMode)) return parsed.storageMode;
        if (parsed.examAndExerciseStorage === 'server') {
            return parsed.resultsAndStudentsData === 'server' ? 'all-server' : 'hybrid';
        }
    } catch {
        // Unreadable: treat like the old default.
    }
    return 'all-local';
}

function getInitialPolicy(): StoragePolicy {
    let legacyLatex: 'server' | 'local' | null = null;
    try {
        legacyLatex = parseLatex(JSON.parse(safeLocalStorage.getItem(LEGACY_MODE_KEY) ?? '{}').latexCompilation);
    } catch {
        // ignore
    }
    const latexCompilation =
        parseLatex(safeLocalStorage.getItem(LATEX_KEY)) ?? legacyLatex ?? DEFAULT_POLICY.latexCompilation;
    // The mode is unknown until `openWorkspace()` has asked the server.
    return { storageMode: null, latexCompilation };
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
            safeLocalStorage.setItem(LATEX_KEY, policy.latexCompilation);
            set(policy);
        },

        /** Everything except the storage mode, deliberately not assignable here (see `armStorageModeSwitch`). */
        updateSetting<K extends 'latexCompilation'>(key: K, value: StoragePolicy[K]) {
            safeLocalStorage.setItem(LATEX_KEY, value);
            update((current) => ({ ...current, [key]: value }));
        },

        /** Publishes the account's mode; only reachable from the workspace layer. @throws if `token` isn't the armed one. */
        commitStorageMode(mode: StorageMode | null, token: string) {
            if (!activeSwitchToken || token !== activeSwitchToken) {
                throw new Error(
                    'Refusing to change the storage mode outside the workspace layer. ' +
                        'Use services/resultsMover.ts, which moves the results first.'
                );
            }
            update((current) => ({ ...current, storageMode: mode }));
        }
    };
}

export const storagePolicyStore = createStoragePolicyStore();

/** True when grading results (students, submissions, scores) live in IndexedDB, i.e. in `hybrid` mode. */
export function resultsAreLocal(): boolean {
    return get(storagePolicyStore).storageMode === 'hybrid';
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
