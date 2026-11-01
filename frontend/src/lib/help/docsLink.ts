import type { Locale } from "#lib/i18n";
import { docsUrl } from "#lib/stores/versionStore";

/** A user-guide page (file name in `docs/user/` and `docs/de/user/`), `""` for the start page. */
type GuidePage = "" | "workflow" | "exercises" | "sharing" | "exams" | "scanning" | "grading" | "results" | "backup" | "settings" | "security" | "admin" | "material";

/** A guide page, optionally with a section anchor: `"exercises#variants"`; anchors are explicit `{#id}` in both languages (guarded by `tests/help.test.ts`). */
export type DocsPath = GuidePage | `${GuidePage}#${string}`;

/** Absolute URL of a user-guide section in the reader's language; German pages live under `de/`. */
export function docsHref(path: DocsPath, locale: Locale): string {
  return new URL(`${locale === "de" ? "de/" : ""}user/${path}`, docsUrl).href;
}
