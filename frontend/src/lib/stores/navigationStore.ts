import { beforeNavigate } from "$app/navigation";
import { get } from "svelte/store";
import { sessionStore } from "./session";
import { translate } from "#lib/i18n";

/** Registers a navigation guard that warns about unsaved changes (sessionStore's isDirty flag). Call once at app init. */
export function registerNavigationGuard(): void {
  beforeNavigate(({ cancel }) => {
    const session = get(sessionStore);
    if (session.isDirty) {
      if (!confirm(translate("common.unsavedChangesConfirm"))) {
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

/** True if the pathname is the grading view (/grade within an exam). */
export function isGradeActivePath(pathname: string): boolean {
  return pathname.includes("/exam/") && pathname.endsWith("/grade");
}

/** True if the pathname is /unlock. */
export function isUnlockPath(pathname: string): boolean {
  return pathname === "/unlock";
}

/**
 * Paths that must render without an unlocked session: Impressum and Datenschutzerklärung (§ 5 DDG,
 * Art. 12 DSGVO; redirecting to /unlock would defeat them), password reset and self-registration
 * pages, and the manual (no data, most useful before signing in).
 */
export function isPublicPath(pathname: string): boolean {
  return (
    isUnlockPath(pathname) ||
    pathname.startsWith("/legal") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/verify-email") ||
    pathname.startsWith("/help")
  );
}