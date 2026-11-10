import { derived, writable, type Readable } from 'svelte/store';
import { apiUrl } from '#lib/api/origin';

/** Build version of this bundle, inlined by Vite (vite.config.ts): bare semver in production ("1.4.0"), "1.4.0-PR#123 [18.08.2026 | 14:32]" for previews, "0.0.0-dev" locally. */
export const frontendVersion: string = __APP_VERSION__;

/** True for preview deployments (see vite.config.ts); production and local dev are false. */
export const isPreviewBuild: boolean = __IS_PREVIEW__;

/** GitHub repository this frontend is published from (see vite.config.ts). */
export const repoUrl: string = __REPO_URL__;

/** Documentation site of the latest release (see vite.config.ts). */
export const docsUrl: string = __DOCS_URL__;

/** Where the footer/navbar version tag links: bare semver -> matching GitHub Release; preview PR format -> the PR; other untagged builds ("1.4.0-a1b2c3d") -> the commit when known; local dev (no SHA) -> no link. */
export function versionUrlFor(version: string, commitSha: string): string | null {
    if (!version.includes('-')) return `${repoUrl}/releases/tag/v${version}`;

    // Preview build with PR format: extract PR number and link to it
    const prMatch = version.match(/PR#(\d+)/);
    if (prMatch) {
        return `${repoUrl}/pull/${prMatch[1]}`;
    }

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
    /** Server unreachable, or it reports no version. */
    | 'unknown';

/** Version reported by the server, or null while unknown. */
export const backendVersionStore = writable<string | null>(null);

/** Drops the " [dd.MM.yyyy | HH:mm]" build stamp of a preview version (deploy-preview.yml redeploys only the changed side, so one PR's frontend and backend legitimately differ in build time). */
function withoutBuildTime(version: string): string {
    if (!version.endsWith(']')) return version;
    const close = version.length - 1;
    const open = version.indexOf('[', version.lastIndexOf(']', close - 1) + 1);
    return open < 0 || open >= close ? version : version.slice(0, open).trimEnd();
}

function majorOf(version: string): number | null {
    // The "-<sha>" preview suffix is not part of the semver core.
    const match = /^(\d+)\./.exec(version.split('-')[0]);
    return match ? Number(match[1]) : null;
}

/** A differing major version means frontend and backend are incompatible; any other difference is merely out of step. */
export function compareVersions(
    frontend: string,
    backend: string | null
): VersionStatus {
    if (!backend) return 'unknown';
    if (withoutBuildTime(frontend) === withoutBuildTime(backend)) return 'match';

    const frontendMajor = majorOf(frontend);
    const backendMajor = majorOf(backend);
    if (frontendMajor === null || backendMajor === null) return 'unknown';

    return frontendMajor === backendMajor ? 'mismatch' : 'incompatible';
}

export const versionStatus: Readable<VersionStatus> = derived(backendVersionStore, ($backendVersion) =>
    compareVersions(frontendVersion, $backendVersion)
);

/** URL for the display version: backend when available (authoritative for compatibility), else frontend. */
export const displayVersionUrl: Readable<string | null> = derived(
    [backendVersionStore],
    ([$backendVersion]) => {
        if ($backendVersion) {
            return versionUrlFor($backendVersion, __APP_COMMIT_SHA__);
        }
        return frontendVersionUrl;
    }
);

let inFlight: Promise<void> | null = null;

/** Read the server's version from GET /api/health. Deliberately bypasses `#lib/api/client` (it appends /api/v1; health sits outside). A passive probe: every failure collapses to 'unknown', none surface as user errors. */
export function refreshBackendVersion(): Promise<void> {
    if (inFlight) return inFlight;

    inFlight = (async () => {
        let result: string | null = null;
        try {
            const response = await fetch(apiUrl('/api/health'), {
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
            backendVersionStore.set(result);
            inFlight = null;
        }
    })();

    return inFlight;
}
