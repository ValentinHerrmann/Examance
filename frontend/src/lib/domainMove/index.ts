/** Domain move (issue #198, docs/domain_move.md): the build names the address it retires (`scripts/domain-move.mjs`); this page runs on the old one, the new one, or neither. */

export interface DomainMove {
  /** Host of the old frontend, also the RP ID of its passkeys. */
  from: string;
  /** API the old frontend keeps using: same site as `from`, so its cookies stay first-party. */
  fromBackendUrl: string;
  /** Origin of the new frontend. */
  to: string;
  /** ISO date from which the old address no longer works. */
  deadline: string;
}

export const domainMove: DomainMove | null = (() => {
  try {
    return __DOMAIN_MOVE__;
  } catch {
    return null;
  }
})();

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

/** Deadline as a local date (midnight), for `$fmt.date`. */
export function deadlineDate(): Date | null {
  return domainMove ? new Date(`${domainMove.deadline}T00:00:00`) : null;
}
