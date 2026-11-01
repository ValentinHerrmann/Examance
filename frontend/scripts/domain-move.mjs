// Domain move (issue #198, docs/domain_move.md): which old address this build retires, where to, and by when. Read by vite.config.ts (`__DOMAIN_MOVE__`, the in-app notice) and by related-origins.mjs (`/.well-known/webauthn`). Delete the defaults once the old addresses are switched off.

/** @typedef {{ from: string, fromBackendUrl: string, to: string, deadline: string }} DomainMove */

/** @type {Record<'release' | 'preview', Omit<DomainMove, 'deadline'>>} */
const DEFAULTS = {
  release: {
    from: 'examance.valentin-herrmann.com',
    fromBackendUrl: 'https://api-examance.valentin-herrmann.com',
    to: 'https://examance.de',
  },
  preview: {
    from: 'prev-examance.valentin-herrmann.com',
    fromBackendUrl: 'https://prev-api-examance.valentin-herrmann.com',
    to: 'https://preview.examance.de',
  },
};

/** The day the old addresses stop working (ISO date, Europe/Berlin). */
const DEFAULT_DEADLINE = '2026-12-07';

/**
 * The move this build announces, or null. Pages builds of `release` and `preview` get the defaults above; `PUBLIC_DOMAIN_MOVE_*` override them, and an empty `PUBLIC_DOMAIN_MOVE_FROM` switches the move off.
 * @param {Record<string, string | undefined>} env
 * @param {string | undefined} branch Cloudflare Pages branch (`CF_PAGES_BRANCH`).
 * @returns {DomainMove | null}
 */
export function computeDomainMove(env, branch) {
  const fallback = branch === 'release' ? DEFAULTS.release : branch ? DEFAULTS.preview : null;
  const from = env.PUBLIC_DOMAIN_MOVE_FROM ?? fallback?.from ?? '';
  const to = env.PUBLIC_DOMAIN_MOVE_TO ?? fallback?.to ?? '';
  if (!from || !to) return null;
  return {
    from,
    fromBackendUrl: env.PUBLIC_DOMAIN_MOVE_FROM_BACKEND_URL ?? fallback?.fromBackendUrl ?? '',
    to: new URL(to).origin,
    deadline: env.PUBLIC_DOMAIN_MOVE_DEADLINE ?? DEFAULT_DEADLINE,
  };
}
