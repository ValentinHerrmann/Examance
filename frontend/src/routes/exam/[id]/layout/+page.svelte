<script lang="ts">
  // The Layout step (issue #272): every choice that changes how the exam looks, with presets and a live sketch; the Print step only prints.
  import { page } from "$app/state";
  import { untrack } from "svelte";
  import { browser } from "$app/env";
  import { get } from "svelte/store";
  import { loadExamCompileContext, type ExamCompileContext } from "#lib/grading/omrTemplatePrep";
  import { contentStamp } from "#lib/exam/examChecks";
  import { examChecksState, examNavContext } from "#lib/stores/shell";
  import { copiesUnavailable } from "#lib/sharing/stickerEntries";
  import { awaitSessionReady, sessionStore } from "#lib/stores/session";
  import { createLoadGuard } from "#lib/utils/loadGuard";
  import { withSavedExam } from "#lib/exam/saveExamLayout";
  import type { ExamRecord } from "#lib/db/schema";
  import ExamPageHeader from "#lib/components/exam/ExamPageHeader.svelte";
  import ExamLayoutSettings from "#lib/components/exam/ExamLayoutSettings.svelte";
  import { t, translate } from "#lib/i18n";
  import { Alert, PageShell } from "#lib/components/ui";

  let examId = $derived(page.params.id || "");
  let ctx = $state.raw<ExamCompileContext | null>(null);
  let loadError = $state("");
  let dirty = $state(false);

  // Personalised copies stamp page codes and QR codes, which an exam graded outside Examance does not print.
  let copiesBlocked = $derived(ctx ? copiesUnavailable(ctx.exercises) : null);

  const loadGuard = createLoadGuard();

  async function load(id: string) {
    const isStale = loadGuard.begin();
    // The previous exam goes at once, so its layout is never saved under this exam's URL.
    ctx = null;
    loadError = "";
    await awaitSessionReady();
    try {
      const loaded = await loadExamCompileContext(id, get(sessionStore).sessionKey);
      if (isStale()) return;
      ctx = loaded;
      if (!loaded) loadError = translate("exam.page.examNotFoundOrDeleted");
    } catch (err) {
      if (!isStale()) loadError = err instanceof Error ? err.message : String(err);
    }
  }

  /** The made print files and ticks are checked against the content stamp, which covers the layout. */
  function saved(exam: ExamRecord) {
    // The sidebar greys the scan steps by the saved grading switch, also when the save lands after leaving the page.
    examNavContext.update((nav) => (nav && nav.examId === exam.id ? { ...nav, exam } : nav));
    // A save of the previous exam that lands after a switch never replaces the shown one.
    const next = withSavedExam(ctx, exam);
    if (!next) return;
    ctx = next;
    const exercises = next.exercises;
    examChecksState.update((cs) => (cs && cs.examId === exam.id && cs.stamps ? { ...cs, stamps: { ...cs.stamps, content: contentStamp(exam, exercises) } } : cs));
  }

  $effect.pre(() => {
    const id = examId;
    if (browser && id) untrack(() => void load(id));
  });
</script>

<PageShell width="fluid">
  <ExamPageHeader {examId} step="layout" title={$t("exam.sidebar.layout")} helpTopic="examCreation" />

  {#if loadError}
    <Alert severity="danger" class="mb-6">{loadError}</Alert>
  {:else if !ctx}
    <div class="text-muted">{$t("exam.page.loading")}</div>
  {:else}
    <ExamLayoutSettings exam={ctx.exam} copiesUnavailable={copiesBlocked} onSaved={saved} bind:dirty />
  {/if}
</PageShell>
