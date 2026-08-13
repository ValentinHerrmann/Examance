import { writable, derived, get } from 'svelte/store';

const BACKEND_URL_KEY = 'bg_backend_url';

const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

/**
 * Validate and normalise a backend origin.
 *
 * Every API request is sent with `credentials: 'include'`, so this value
 * decides where the session cookies — and the login request itself — are sent.
 * An unvalidated value written to localStorage (by XSS, a browser extension, or
 * a "point the app at this server" instruction) would redirect all
 * authenticated traffic to a host of the attacker's choosing.
 *
 * @throws Error with a user-presentable message when the input is unusable.
 */
export function normalizeBackendUrl(raw: string): string {
    if (!raw || !raw.trim()) return '';

    let parsed: URL;
    try {
        parsed = new URL(raw.trim());
    } catch {
        throw new Error('Backend address must be a full URL, e.g. https://api.example.org');
    }

    const isLoopback = LOOPBACK_HOSTS.includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && isLoopback)) {
        throw new Error('Backend address must use https:// (http:// is allowed only for localhost).');
    }
    if (parsed.username || parsed.password) {
        throw new Error('Backend address must not contain credentials.');
    }
    if (parsed.search || parsed.hash) {
        throw new Error('Backend address must not contain a query string or fragment.');
    }

    // Origin only — path, query and fragment are dropped; the API client
    // appends /api/v1 itself.
    return parsed.origin;
}

function safeNormalize(raw: string): string {
    try {
        return normalizeBackendUrl(raw);
    } catch {
        return '';
    }
}

function createBackendStore() {
    let initialUrl = '';
    if (typeof localStorage !== 'undefined') {
        // A value already in storage is re-validated: it may predate this check
        // or have been written by something other than the settings form.
        initialUrl = safeNormalize(localStorage.getItem(BACKEND_URL_KEY) || '');
    }

    const { subscribe, set } = writable<string>(initialUrl);

    /** Validate, persist and publish. Throws on an unusable address. */
    const persist = (url: string) => {
        const normalized = normalizeBackendUrl(url);
        if (typeof localStorage !== 'undefined') {
            if (normalized) {
                localStorage.setItem(BACKEND_URL_KEY, normalized);
            } else {
                localStorage.removeItem(BACKEND_URL_KEY);
            }
        }
        set(normalized);
    };

    return {
        subscribe,
        /** Not persisted, but still validated — it is used for live requests. */
        setTransient: (url: string) => {
            set(normalizeBackendUrl(url));
        },
        saveSuccessfulBackendUrl: persist,
        set: persist,
        restoreSavedUrl: () => {
            let saved = '';
            if (typeof localStorage !== 'undefined') {
                saved = safeNormalize(localStorage.getItem(BACKEND_URL_KEY) || '');
            }
            set(saved);
        },
        clear: () => {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(BACKEND_URL_KEY);
            }
            set('');
        }
    };
}

export const backendStore = createBackendStore();

export const effectiveBackendStore = derived(backendStore, ($url) => {
    return $url || '';
});

