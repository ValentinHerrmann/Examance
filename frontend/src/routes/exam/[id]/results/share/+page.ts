import { redirect } from "@sveltejs/kit";
import { shareHref } from "#lib/utils/links";

/** Old Results tab (issue #276 made it its own step): only redirects. */
export function load({ params, url }) {
  redirect(308, `${shareHref(params.id)}${url.search}`);
}
