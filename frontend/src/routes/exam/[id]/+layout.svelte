<script lang="ts">
  import { page } from "$app/stores";
  import { onDestroy, untrack } from "svelte";
  import type { Snippet } from "svelte";
  import { browser } from "$app/environment";
  import { afterNavigate } from "$app/navigation";
  import { get } from "svelte/store";
  import { sessionStore } from "$lib/stores/session";
  import { loadExamEncrypted } from "$lib/db/dbEncryption";
  import { submissionRepository } from "$lib/repositories/submissionRepository";
  import type { ExamRecord } from "$lib/db/schema";
  import { examNavContext } from "$lib/stores/shell";
  import { t } from "$lib/i18n";

  interface Props {
    params?: Record<string, string>;
    children?: Snippet;
  }

  let { children }: Props = $props();

  let examId = $derived($page.params.id || "");
  let pathname = $derived($page.url.pathname);

  // Raw: the record is handed to examNavContext, which must not receive a proxy.
  let exam: ExamRecord | null = $state.raw(null);
  let submissionCount = $state(0);

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

  onDestroy(() => examNavContext.set(null));

  let isGradeActive = $derived(pathname.startsWith(`/exam/${examId}/grade`));

  $effect.pre(() => {
    const id = examId;
    if (browser && id && $sessionStore.sessionKey) {
      untrack(() => loadExamHeaderData(id));
    }
  });

  // The sidebar and the phone drawer live in the app shell (so they do not
  // scroll with the page); this layout only tells them which exam is open.
  $effect.pre(() => {
    const id = examId;
    const current = exam;
    const count = submissionCount;
    if (browser && id) {
      untrack(() => examNavContext.set({ examId: id, exam: current && current.id === id ? current : null, submissionCount: count }));
    }
  });
</script>

<!-- Size container (columns follow `@3xl:` container variants, not the viewport).
     The grade page fills the space above the footer; other pages grow so the main area scrolls. -->
<div class="@container flex w-full min-w-0 flex-col {isGradeActive ? 'min-h-0 flex-1' : 'grow'}">
  {#if exam && exam.id === examId && !isGradeActive}
    <!-- The exam's name, as a heading at every width: the sidebar can be
         collapsed or absent (below `lg`), so it cannot be the one place that
         names the exam. -->
    <h2 class="m-0 truncate px-4 pt-3 text-base font-semibold text-content sm:px-6" title={exam.title}>
      {exam.title || $t("exam.nav.examFallback")}
    </h2>
  {/if}
  {@render children?.()}
</div>
