import { get, writable } from "svelte/store";
import { safeLocalStorage } from "$lib/utils/storage";
import { topicForPath, type HelpTopicId } from "$lib/help/topics";

/**
 * State of the global help panel.
 *
 * `topicId === null` means "show the topic overview". Opening without an
 * explicit topic resolves one from the current pathname, so the panel always
 * lands on something relevant to what the teacher is looking at.
 */
export interface HelpState {
  open: boolean;
  topicId: HelpTopicId | null;
}

const SEEN_KEY = "bg_help_seen";

function readSeen(): boolean {
  return safeLocalStorage.getItem(SEEN_KEY) === "1";
}

/**
 * `false` until the help panel has been opened once. Drives nothing more than
 * a quiet highlight on the status-bar entry — never a blocking overlay.
 */
export const helpSeen = writable<boolean>(readSeen());

export const helpStore = writable<HelpState>({ open: false, topicId: null });

function markSeen(): void {
  if (!get(helpSeen)) {
    safeLocalStorage.setItem(SEEN_KEY, "1");
    helpSeen.set(true);
  }
}

/** Open the panel, on `topic` when given, otherwise on the current page's topic. */
export function openHelp(topic?: HelpTopicId): void {
  const resolved =
    topic ??
    (typeof window !== "undefined" ? topicForPath(window.location.pathname) : "gettingStarted");
  markSeen();
  helpStore.set({ open: true, topicId: resolved });
}

/** Open the panel on the topic list rather than on a single topic. */
export function openHelpOverview(): void {
  markSeen();
  helpStore.set({ open: true, topicId: null });
}

export function closeHelp(): void {
  helpStore.update((state) => ({ ...state, open: false }));
}

export function toggleHelp(): void {
  if (get(helpStore).open) {
    closeHelp();
  } else {
    openHelp();
  }
}

/** Switch the visible topic while the panel stays open. */
export function selectHelpTopic(topic: HelpTopicId | null): void {
  helpStore.update((state) => ({ ...state, topicId: topic }));
}
