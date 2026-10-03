<script lang="ts">
  import { page } from "$app/stores";
  export let params;
  import { onDestroy } from "svelte";
  import { browser } from "$app/environment";
  import { afterNavigate } from "$app/navigation";
  import { get } from "svelte/store";
  import { sessionStore } from "$lib/stores/session";
  import { loadExamEncrypted } from "$lib/db/dbEncryption";
  import { submissionRepository } from "$lib/repositories/submissionRepository";
  import type { ExamRecord } from "$lib/db/schema";
  import { examNavContext } from "$lib/stores/shell";
  import { t } from "$lib/i18n";

  $: examId = $page.params.id || "";
  $: pathname = $page.url.pathname;

  let exam: ExamRecord | null = null;
  let submissionCount = 0;

  $: if (browser && examId && $sessionStore.sessionKey) {
    loadExamHeaderData(examId);
  }

  afterNavigate(() => {
    if (examId && $sessionStore.sessionKey) {
      loadExamHeaderData(examId);
    }
  });

  async function loadExamHeaderData(id: string) {
    const key = get(sessionStore).sessionKey;
    try {
      exam = (await loadExamEncrypted(id, key)) || null;
      const subs = await submissionRepository.getByExamId(id, key);
      submissionCount = subs.length;
    } catch (e) {
      console.error(e);
    }
  }

  // The sidebar and the phone drawer live in the app shell (so they do not
  // scroll with the page); this layout only tells them which exam is open.
  $: if (browser && examId) {
    examNavContext.set({ examId, exam: exam && exam.id === examId ? exam : null, submissionCount });
  }

  onDestroy(() => examNavContext.set(null));

  $: isGradeActive = pathname.startsWith(`/exam/${examId}/grade`);
</script>

<!-- A size container: exam content shares the width with the sidebar, so its
     columns follow `@3xl:`-style container variants, not the viewport.
     The grade page fills exactly the space above the footer (`flex-1 min-h-0`);
     every other page grows with its content so the main area scrolls. -->
<div class="@container flex w-full min-w-0 flex-col {isGradeActive ? 'min-h-0 flex-1' : 'grow'}">
  {#if exam && exam.id === examId && !isGradeActive}
    <!-- The exam's name, as a heading at every width: the sidebar can be
         collapsed or absent (below `lg`), so it cannot be the one place that
         names the exam. -->
    <h2 class="m-0 truncate px-4 pt-3 text-base font-semibold text-content sm:px-6" title={exam.title}>
      {exam.title || $t("exam.nav.examFallback")}
    </h2>
  {/if}
  <slot />
</div>
