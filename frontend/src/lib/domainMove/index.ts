/** Domain move (issue #198, docs/domain_move.md): the build names the address it retires (`scripts/domain-move.mjs`); this page runs on the old one, the new one, or neither. */

export interface DomainMove {
  /** Host of the old frontend, also the RP ID of its passkeys. */
  from: string;
  /** API the old frontend keeps using until the redirect: same site as `from`, so its cookies stay first-party. */
  fromApiUrl: string;
  /** Origin of the new frontend. */
  to: string;
  /** ISO date from which the old address forwards to the new one. */
  redirectDate: string;
}

export const domainMove: DomainMove | null = (() => {
  try {
    return __DOMAIN_MOVE__;
  } catch {
    return null;
  }
})();

const LEGACY_SIGN_IN_KEY = "examance.signedInWithOldPasskey";

function currentHost(): string {
  return typeof location === "undefined" ? "" : location.hostname;
}

/** This page is served from the address being retired. */
export function onOldAddress(): boolean {
  return domainMove !== null && currentHost() === domainMove.from;
}

/** This page is served from the new address, where passkeys of the old one need the related-origins route. */
export function onNewAddress(): boolean {
  return domainMove !== null && currentHost() === new URL(domainMove.to).hostname;
}

/** Host of the new address, for messages. */
export function newHost(): string {
  return domainMove ? new URL(domainMove.to).host : "";
}

/** The same page on the new address. */
export function newAddressHref(path: string): string {
  return domainMove ? new URL(path, domainMove.to).href : path;
}

/** Redirect date as a local date (midnight), for `$fmt.date`. */
export function redirectDate(): Date | null {
  return domainMove ? new Date(`${domainMove.redirectDate}T00:00:00`) : null;
}

/** Marks this tab's sign-in as made with a passkey of the old address: it must be replaced before going on. */
export function rememberOldPasskeySignIn(value: boolean): void {
  try {
    if (value) sessionStorage.setItem(LEGACY_SIGN_IN_KEY, "1");
    else sessionStorage.removeItem(LEGACY_SIGN_IN_KEY);
  } catch {
    // Storage may be blocked; the dialog then offers "Later" instead of insisting.
  }
}

export function signedInWithOldPasskey(): boolean {
  try {
    return sessionStorage.getItem(LEGACY_SIGN_IN_KEY) === "1";
  } catch {
    return false;
  }
}
