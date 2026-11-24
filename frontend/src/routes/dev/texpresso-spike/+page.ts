import { redirect } from "@sveltejs/kit";
import { dev } from "$app/env";
import { isPreviewBuild } from "#lib/stores/versionStore";

/** The TeXpresso spike (docs/dev/latex_performance.md) exists only in dev and preview builds; release builds send it home. */
export function load() {
  if (!dev && !isPreviewBuild) redirect(307, "/");
}
