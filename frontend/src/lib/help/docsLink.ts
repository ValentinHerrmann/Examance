import type { Locale } from "#lib/i18n";
import { docsUrl } from "#lib/stores/versionStore";

/** A user-guide page, optionally with a section anchor, relative to the guide root: `"exercises#variants"`, `""` for the start page. The anchors are explicit `{#id}` in both `docs/user/` and `docs/de/user/` (guarded by `tests/helpDocsLinks.test.ts`). */
export type DocsPath = string;

/** Absolute URL of a user-guide section in the reader's language; German pages live under `de/`. */
export function docsHref(path: DocsPath, locale: Locale): string {
  return new URL(`${locale === "de" ? "de/" : ""}user/${path}`, docsUrl).href;
}
