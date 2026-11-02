// Domain move (issue #198, docs/hosting.md "Moving to a new domain"): which old address this build retires, where to, and from when it forwards. Read by vite.config.ts (`__DOMAIN_MOVE__`) and related-origins.mjs (`/.well-known/webauthn`). Delete the defaults once old passkeys are no longer accepted.

/** @typedef {{ from: string, to: string, redirectDate: string }} DomainMove */

/** @type {Record<'release' | 'preview', Omit<DomainMove, 'redirectDate'>>} */
const DEFAULTS = {
  release: { from: 'examance.valentin-herrmann.com', to: 'https://examance.de' },
  preview: { from: 'prev-examance.valentin-herrmann.com', to: 'https://preview.examance.de' },
};

/** The day the old address starts forwarding (ISO date, Europe/Berlin); until then it serves only hybrid accounts taking their results along. */
const DEFAULT_REDIRECT_DATE = '2026-11-23';

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
    to: new URL(to).origin,
    redirectDate: env.PUBLIC_DOMAIN_MOVE_REDIRECT_DATE ?? DEFAULT_REDIRECT_DATE,
  };
}
