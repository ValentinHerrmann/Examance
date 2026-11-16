import { redirect } from "@sveltejs/kit";
import { reviewsHref } from "#lib/utils/links";

/** Old Results tab (issue #276 made it its own step): only redirects. */
export function load({ params, url }) {
  redirect(308, `${reviewsHref(params.id)}${url.search}`);
}
