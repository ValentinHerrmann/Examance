import { redirect } from "@sveltejs/kit";

/** Old links (bookmarks, history) to the former statistics route; it now is the Results step (issue #212). */
export function load({ params, url }) {
  redirect(308, `/exam/${encodeURIComponent(params.id)}/results${url.search}`);
}
