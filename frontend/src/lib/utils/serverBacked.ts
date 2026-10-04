import { get } from "svelte/store";
import { isAuthenticated } from "#lib/stores/session";

/**
 * True when exams and exercises are read from and written to the server. Since local mode was
 * discontinued (issue #47) that is every signed-in session; both storage modes keep exams and
 * exercises on the server and differ only in where grading results live (`resultsAreLocal()`).
 */
export function isServerBacked(): boolean {
  return get(isAuthenticated);
}
