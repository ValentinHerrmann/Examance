<script lang="ts">
  // The Results step (issue #212): Statistics, Send to students and Archive as route tabs.
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { faBoxArchive, faChartColumn, faCommentDots } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { Tabs, actionIcons } from "#lib/components/ui";
  import { archiveHref, resultsHref, reviewsHref, shareHref } from "#lib/utils/links";
  import { examNavContext } from "#lib/stores/shell";

  let { children }: { children?: Snippet } = $props();

  let examId = $derived(page.params.id || "");
  const TABS = [
    { id: "share", href: shareHref },
    { id: "reviews", href: reviewsHref },
    { id: "archive", href: archiveHref },
  ];
  let active = $derived(TABS.find((tab) => page.url.pathname.startsWith(tab.href(examId)))?.id ?? "stats");
  // Open objections, counted by the exam layout from the share list (no extra request).
  let objections = $derived($examNavContext?.examId === examId ? $examNavContext.progress.results?.objections : undefined);
</script>

<div class="px-4 pt-3 sm:px-6">
  <Tabs
    compact
    label={$t("exam.sidebar.results")}
    value={active}
    items={[
      { id: "stats", label: $t("exam.results.tabStats"), href: resultsHref(examId), icon: faChartColumn },
      { id: "share", label: $t("exam.results.tabShare"), href: shareHref(examId), icon: actionIcons.share },
      { id: "reviews", label: $t("exam.results.tabReviews"), href: reviewsHref(examId), icon: faCommentDots, ...(objections ? { count: objections } : {}) },
      { id: "archive", label: $t("exam.results.tabArchive"), href: archiveHref(examId), icon: faBoxArchive },
    ]}
  />
</div>
{@render children?.()}
