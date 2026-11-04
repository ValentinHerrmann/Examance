<script lang="ts">
  // The Results step (issue #212): Statistics and Share as route tabs.
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { faChartColumn } from "@fortawesome/free-solid-svg-icons";
  import { t } from "#lib/i18n";
  import { gradingKeyDirty } from "#lib/stores/shell";
  import { Tabs, actionIcons } from "#lib/components/ui";
  import { resultsHref, shareHref } from "#lib/utils/links";

  let { children }: { children?: Snippet } = $props();

  let examId = $derived(page.params.id || "");
  let active = $derived(page.url.pathname.startsWith(shareHref(examId)) ? "share" : "stats");
</script>

<div class="px-4 pt-3 sm:px-6">
  <Tabs
    label={$t("exam.sidebar.results")}
    value={active}
    items={[
      { id: "stats", label: $t("exam.results.tabStats"), href: resultsHref(examId), icon: faChartColumn, dirty: $gradingKeyDirty ? $t("exam.results.unsavedKey") : undefined },
      { id: "share", label: $t("exam.results.tabShare"), href: shareHref(examId), icon: actionIcons.share },
    ]}
  />
</div>
{@render children?.()}
