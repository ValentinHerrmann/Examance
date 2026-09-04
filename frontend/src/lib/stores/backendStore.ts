import { writable, derived, get } from 'svelte/store';
import { safeLocalStorage } from '$lib/utils/storage';
import { recordValue } from '$lib/utils/recentValues';

const BACKEND_URL_KEY = 'bg_backend_url';

export const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]', '::1'];

/**
 * Returns true when the provided host or IP represents a local loopback address.
 */
export function isLoopbackHost(hostOrIp: string): boolean {
    const clean = hostOrIp.trim().toLowerCase().replace(/^\[|\]$/g, '');
    return (
        clean === 'localhost' ||
        clean === '127.0.0.1' ||
        clean.startsWith('127.') ||
        clean === '::1'
    );
}

/**
 * Removes any leading http:// or https:// scheme from the raw address.
 */
export function stripBackendProtocol(raw: string): string {
    return (raw || '').trim().replace(/^https?:\/\//i, '');
}

/**
 * Extracts the hostname (without protocol, port, path, query, or fragment).
 */
export function extractHostname(raw: string): string {
    const stripped = stripBackendProtocol(raw);
    const hostPort = stripped.split(/[\/\?\#]/)[0].trim();
    if (hostPort.startsWith('[')) {
        const closing = hostPort.indexOf(']');
        return closing > -1 ? hostPort.slice(1, closing) : hostPort;
    }
    return hostPort.split(':')[0];
}

/**
 * Returns true if the frontend is currently being served from a loopback address
 * (e.g. npm run dev or VS Code debugging on http://localhost:5173).
 */
export function isLocalhostFrontend(): boolean {
    if (typeof window === 'undefined' || !window.location) {
        return false;
    }
    return isLoopbackHost(window.location.hostname);
}

/**
 * Automatically determines the protocol for a backend address:
 * - Loopback / localhost backends are forced to 'http:'
 * - Non-local backends are forced to 'https:'
 */
export function inferBackendProtocol(raw: string): 'http:' | 'https:' {
    const hostname = extractHostname(raw);
    if (!hostname) {
        return isLocalhostFrontend() ? 'http:' : 'https:';
    }
    return isLoopbackHost(hostname) ? 'http:' : 'https:';
}

/**
 * Validate and normalise a backend origin.
 *
 * Rules:
 * - Non-local backends always use HTTPS
 * - Localhost / 127.0.0.1 / loopback backends always use HTTP
 * - Protocol is forced automatically regardless of whether the user provided one.
 * - Credentials, queries, fragments and non-http schemes are strictly rejected.
 * - Path is dropped; the API client appends /api/v1 itself.
 *
 * @throws Error with a user-presentable message when the input is unusable.
 */
export function normalizeBackendUrl(raw: string): string {
    if (!raw || !raw.trim()) return '';

    const trimmed = raw.trim();

    // Reject non-http(s) schemes like ftp://, javascript:, data:, etc.
    // Note: a port like localhost:8000 or host.com:8443 has digits after the colon, not a scheme.
    const schemeMatch = trimmed.match(/^([a-z][a-z0-9+.-]*):/i);
    if (schemeMatch) {
        const scheme = schemeMatch[1].toLowerCase();
        const afterColon = trimmed.slice(schemeMatch[0].length);
        const isPort = /^\d+(\/|$)/.test(afterColon);
        if (!isPort) {
            if (scheme !== 'http' && scheme !== 'https') {
                throw new Error('Backend address must be a valid host or URL.');
            }
        }
    }

    const stripped = stripBackendProtocol(trimmed);
    if (!stripped) return '';

    if (stripped.includes('@')) {
        throw new Error('Backend address must not contain credentials.');
    }
    if (stripped.includes('?') || stripped.includes('#')) {
        throw new Error('Backend address must not contain a query string or fragment.');
    }

    let parsed: URL;
    try {
        parsed = new URL(`http://${stripped}`);
    } catch {
        throw new Error('Backend address must be a valid host or URL, e.g. api.example.org or localhost:8000');
    }

    if (parsed.username || parsed.password) {
        throw new Error('Backend address must not contain credentials.');
    }
    if (parsed.search || parsed.hash) {
        throw new Error('Backend address must not contain a query string or fragment.');
    }
    if (!parsed.hostname) {
        throw new Error('Backend address must be a valid host.');
    }

    // A valid host must either be a loopback host or a domain name containing at least one dot
    if (!isLoopbackHost(parsed.hostname) && !parsed.hostname.includes('.')) {
        throw new Error('Backend address must be a valid host or URL, e.g. api.example.org or localhost:8000');
    }

    const isLoopback = isLoopbackHost(parsed.hostname);
    const forcedProtocol = isLoopback ? 'http:' : 'https:';

    return `${forcedProtocol}//${parsed.host}`;
}

function safeNormalize(raw: string): string {
    try {
        return normalizeBackendUrl(raw);
    } catch {
        return '';
    }
}

function getConstant(getter: () => string): string {
    try {
        return getter() || '';
    } catch {
        return '';
    }
}

/**
 * Returns the default backend URL for initial loads:
 * - When frontend runs at localhost, default to http://localhost:8000
 * - In preview and production, default to the build-time configured default API
 */
export function defaultBackendUrl(): string {
    if (isLocalhostFrontend()) {
        return 'http://localhost:8000';
    }
    const buildDefault = getConstant(() => __DEFAULT_BACKEND_URL__);
    return safeNormalize(buildDefault);
}

export const DEFAULT_PROD_HOST = 'api-examance.valentin-herrmann.com';
export const DEFAULT_PREVIEW_HOST = 'prev-api-examance.valentin-herrmann.com';
export const DEFAULT_LOCAL_HOST = 'localhost:8000';

/**
 * Returns a list of known server hosts (without protocol) to show in the suggestions dropdown.
 * - When running at localhost: localhost:8000, preview, and production servers
 * - Otherwise: default server, production, preview, and localhost
 */
export function knownServerSuggestions(): string[] {
    const prodHost =
        stripBackendProtocol(getConstant(() => __PROD_BACKEND_URL__)) || DEFAULT_PROD_HOST;
    const previewHost =
        stripBackendProtocol(getConstant(() => __PREVIEW_BACKEND_URL__)) || DEFAULT_PREVIEW_HOST;
    const defaultHost = stripBackendProtocol(getConstant(() => __DEFAULT_BACKEND_URL__));

    const list: string[] = [];
    if (isLocalhostFrontend()) {
        list.push(DEFAULT_LOCAL_HOST);
        if (previewHost) list.push(previewHost);
        if (prodHost) list.push(prodHost);
    } else {
        if (defaultHost) list.push(defaultHost);
        if (prodHost) list.push(prodHost);
        if (previewHost) list.push(previewHost);
        list.push(DEFAULT_LOCAL_HOST);
    }
    return Array.from(new Set(list)).filter(Boolean);
}

function createBackendStore() {
    let initialUrl = '';
    initialUrl =
        safeNormalize(safeLocalStorage.getItem(BACKEND_URL_KEY) || '') || defaultBackendUrl();

    const { subscribe, set } = writable<string>(initialUrl);

    /** Validate, persist and publish. Throws on an unusable address. */
    const persist = (url: string) => {
        const normalized = normalizeBackendUrl(url);
        if (normalized) {
            safeLocalStorage.setItem(BACKEND_URL_KEY, normalized);
            // Record in recent suggestions without protocol so it's selectable on future page loads
            recordValue('backend.url', stripBackendProtocol(normalized));
        } else {
            safeLocalStorage.removeItem(BACKEND_URL_KEY);
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
            const saved = safeNormalize(safeLocalStorage.getItem(BACKEND_URL_KEY) || '');
            set(saved || defaultBackendUrl());
        },
        clear: () => {
            safeLocalStorage.removeItem(BACKEND_URL_KEY);
            set('');
        }
    };
}

export const backendStore = createBackendStore();

export const effectiveBackendStore = derived(backendStore, ($url) => {
    return $url || '';
});

