import { derived, get, writable, type Readable } from 'svelte/store';
import { effectiveBackendStore } from '$lib/stores/backendStore';

/**
 * Build version of this frontend bundle, inlined by Vite (see vite.config.ts).
 * Production builds carry a bare semver ("1.4.0"); preview builds append the
 * short commit SHA ("1.4.0-a1b2c3d"); local dev is "0.0.0-dev".
 */
export const frontendVersion: string = __APP_VERSION__;

/** GitHub repository this frontend is published from (see vite.config.ts). */
export const repoUrl: string = __REPO_URL__;

/**
 * Where the version tag in the status bar should link to.
 *
 * A bare semver ("1.4.0") is a tagged release, so it links to the matching
 * GitHub Release. Anything else — a preview build ("1.4.0-a1b2c3d") or local
 * dev ("0.0.0-dev") — is not tagged, so it links to the exact commit it was
 * built from instead, when that commit is known. Local dev builds carry no
 * commit SHA, so they get no link at all.
 */
export function versionUrlFor(version: string, commitSha: string): string | null {
    if (!version.includes('-')) return `${repoUrl}/releases/tag/v${version}`;
    return commitSha ? `${repoUrl}/commit/${commitSha}` : null;
}

/** Link target for this build's own version tag. */
export const frontendVersionUrl: string | null = versionUrlFor(
    frontendVersion,
    __APP_COMMIT_SHA__
);

export type VersionStatus =
    /** Frontend and server report the same build. */
    | 'match'
    /** Same major version — compatible, but the two are out of sync. */
    | 'mismatch'
    /** Different major version — the API contract has broken. */
    | 'incompatible'
    /** Server configured but unreachable, or it reports no version. */
    | 'unknown'
    /** No backend address configured (local-only mode). */
    | 'no-server';

/** Version reported by the configured server, or null while unknown. */
export const backendVersionStore = writable<string | null>(null);

function majorOf(version: string): number | null {
    // The "-<sha>" preview suffix is not part of the semver core.
    const match = /^(\d+)\./.exec(version.split('-')[0]);
    return match ? Number(match[1]) : null;
}

/**
 * A differing major version means frontend and backend are incompatible; any
 * other difference means they are merely out of step.
 */
export function compareVersions(
    frontend: string,
    backend: string | null,
    hasServer: boolean
): VersionStatus {
    if (!hasServer) return 'no-server';
    if (!backend) return 'unknown';
    if (frontend === backend) return 'match';

    const frontendMajor = majorOf(frontend);
    const backendMajor = majorOf(backend);
    if (frontendMajor === null || backendMajor === null) return 'unknown';

    return frontendMajor === backendMajor ? 'mismatch' : 'incompatible';
}

export const versionStatus: Readable<VersionStatus> = derived(
    [backendVersionStore, effectiveBackendStore],
    ([$backendVersion, $backendUrl]) =>
        compareVersions(frontendVersion, $backendVersion, Boolean($backendUrl))
);

let inFlight: Promise<void> | null = null;
let inFlightOrigin = '';
let latestProbe = 0;

/**
 * Read the server's version from GET /api/health.
 *
 * Deliberately not routed through `$lib/api/client`: that client appends the
 * /api/v1 prefix, and health sits outside it. This is a passive status probe —
 * every failure collapses into the 'unknown' state and none of them surface as
 * a user-facing error.
 */
export function refreshBackendVersion(): Promise<void> {
    const origin = get(effectiveBackendStore);
    if (!origin) {
        backendVersionStore.set(null);
        return Promise.resolve();
    }

    // Coalesce concurrent probes, but only for the same server: if the address
    // changed mid-flight, the outstanding request answers for the wrong host.
    if (inFlight && inFlightOrigin === origin) return inFlight;

    inFlightOrigin = origin;
    // Only the newest probe may publish, so a slow answer from a previously
    // configured server cannot overwrite a newer one.
    const token = ++latestProbe;

    inFlight = (async () => {
        let result: string | null = null;
        try {
            const response = await fetch(`${origin}/api/health`, {
                credentials: 'include',
            });
            if (response.ok) {
                const body: unknown = await response.json();
                const version =
                    typeof body === 'object' && body !== null && 'version' in body
                        ? (body as { version: unknown }).version
                        : undefined;
                if (typeof version === 'string') result = version;
            }
        } catch {
            result = null;
        } finally {
            if (token === latestProbe) {
                backendVersionStore.set(result);
                inFlight = null;
            }
        }
    })();

    return inFlight;
}
