// The API origins the page may connect to (issue #198), for the CSP's connect-src. Exact when the build knows them (PUBLIC_API_URL, plus the old API of a domain move); otherwise `https:`, since the default `api.<frontend host>` is only known in the browser (src/lib/api/origin.ts).
import { computeDomainMove } from './domain-move.mjs';

export const API_PLACEHOLDER = '__API_ORIGINS__';

/**
 * @param {Record<string, string | undefined>} env
 * @param {string | undefined} branch Cloudflare Pages branch (`CF_PAGES_BRANCH`).
 * @returns {string} Space-separated CSP source list.
 */
export function apiConnectSources(env, branch) {
  const configured = env.PUBLIC_API_URL?.trim();
  if (!configured) return 'https:';
  const origins = new Set([new URL(configured).origin]);
  const move = computeDomainMove(env, branch);
  if (move?.fromApiUrl) origins.add(move.fromApiUrl);
  return [...origins].join(' ');
}
