<script lang="ts">
  // The Review step (issue #276): Send to students and Objections as route tabs.
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { faCommentDots } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Tabs, actionIcons } from "#lib/components/ui";
  import { reviewsHref, shareHref } from "#lib/utils/links";
  import { examNavContext } from "#lib/stores/shell";

  let { children }: { children?: Snippet } = $props();

  let examId = $derived(page.params.id || "");
  let active = $derived(page.url.pathname.startsWith(reviewsHref(examId)) ? "objections" : "share");
  // Open objections, counted by the exam layout from the share list (no extra request).
  let objections = $derived($examNavContext?.examId === examId ? $examNavContext.progress.review?.objections : undefined);
</script>

<div class="px-4 pt-3 sm:px-6">
  <Tabs
    compact
    label={$t("exam.sidebar.review")}
    value={active}
    items={[
      { id: "share", label: $t("exam.review.tabShare"), href: shareHref(examId), icon: actionIcons.share },
      { id: "objections", label: $t("exam.review.tabObjections"), href: reviewsHref(examId), icon: faCommentDots, ...(objections ? { count: objections } : {}) },
    ]}
  />
</div>
{@render children?.()}
