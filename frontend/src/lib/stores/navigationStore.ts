import { beforeNavigate } from "$app/navigation";
import { get } from "svelte/store";
import { sessionStore } from "./session";

/**
 * Registers a navigation guard that warns the user about unsaved changes
 * before leaving the page. Uses the sessionStore's isDirty flag.
 *
 * Call this once during app initialization.
 */
export function registerNavigationGuard(): void {
  beforeNavigate(({ cancel }) => {
    const session = get(sessionStore);
    if (session.isDirty) {
      if (!confirm("You have unsaved changes. Are you sure you want to leave this page?")) {
        cancel();
      }
    }
  });
}

/**
 * Navigates to the unlock page with a hard redirect.
 */
export function redirectToUnlock(): void {
  if (typeof window !== "undefined") {
    window.location.href = "/unlock";
  }
}

/**
 * Navigates to the home page with a hard redirect.
 */
export function redirectToHome(): void {
  if (typeof window !== "undefined") {
    window.location.href = "/";
  }
}

/**
 * Checks if the current URL path indicates the grading view.
 * @param pathname - The current URL pathname
 * @returns true if on the /grade page within an exam
 */
export function isGradeActivePath(pathname: string): boolean {
  return pathname.includes("/exam/") && pathname.endsWith("/grade");
}

/**
 * Checks if the current URL is the unlock page.
 * @param pathname - The current URL pathname
 * @returns true if on /unlock
 */
export function isUnlockPath(pathname: string): boolean {
  return pathname === "/unlock";
}

/**
 * Paths that must render without an unlocked session.
 *
 * The Impressum and the Datenschutzerklärung have to be reachable by anyone,
 * without logging in (§ 5 DDG, Art. 12 DSGVO) — redirecting them to /unlock
 * would defeat their purpose.
 */
export function isPublicPath(pathname: string): boolean {
  return isUnlockPath(pathname) || pathname.startsWith("/legal");
}