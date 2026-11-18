/** Sequence guard for loads keyed by a route param: each `begin()` returns an `isStale` that turns true once a newer `begin()` ran, so a slow load of the previous id never writes. */
export function createLoadGuard(): { begin(): () => boolean } {
  let seq = 0;
  return {
    begin() {
      const mine = ++seq;
      return () => mine !== seq;
    },
  };
}
