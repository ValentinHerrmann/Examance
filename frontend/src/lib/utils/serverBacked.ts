import { get } from "svelte/store";
import { isAuthenticated } from "#lib/stores/session";
import { storagePolicyStore } from "#lib/stores/storagePolicy";

/** True when the signed-in teacher's exams/exercises live on (or sync with) the server. */
export function isServerBacked(): boolean {
  return get(isAuthenticated) && get(storagePolicyStore).storageMode !== "all-local";
}
