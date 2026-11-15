<script lang="ts">
  // Results tab "Objections" (issue #226): every objection of the exam, open and answered (docs/dev/grading_review.md).
  import { page } from "$app/state";
  import { t } from "#lib/i18n";
  import { PageShell } from "#lib/components/ui";
  import ExamPageHeader from "#lib/components/exam/ExamPageHeader.svelte";
  import ReviewOverview from "#lib/components/sharing/ReviewOverview.svelte";

  let examId = $derived(page.params.id || "");
</script>

<PageShell width="fluid">
  <ExamPageHeader {examId} step="results" title={$t("review.overview.title")} hint={$t("review.overview.intro")} helpTopic="stats" />
  {#if examId}<ReviewOverview {examId} />{/if}
</PageShell>
