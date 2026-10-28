import { redirect } from "@sveltejs/kit";

/** Old links (bookmarks, history) to the former item route; the item view now lives in `/verify` (M5). */
export function load({ params, url }) {
  redirect(308, `/exam/${encodeURIComponent(params.id)}/verify${url.search}`);
}
