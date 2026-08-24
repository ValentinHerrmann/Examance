<script lang="ts">
  import { page } from "$app/stores";
  export let params;
  import { onMount } from "svelte";
  import { browser } from "$app/environment";
  import { afterNavigate } from "$app/navigation";
  import { get } from "svelte/store";
  import { sessionStore } from "$lib/stores/session";
  import { loadExamEncrypted } from "$lib/db/dbEncryption";
  import { submissionRepository } from "$lib/repositories/submissionRepository";
  import { db } from "$lib/db/db";
  import type { ExamRecord } from "$lib/db/schema";
  import ExamNav from "$lib/components/layout/ExamNav.svelte";

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

  $: isSetupActive = pathname === `/exam/${examId}` || pathname === `/exam/${examId}/`;
  $: isScanActive = pathname.startsWith(`/exam/${examId}/scan`);
  $: isVerifyActive = pathname.startsWith(`/exam/${examId}/verify`);
  $: isGradeActive = pathname.startsWith(`/exam/${examId}/grade`);
  $: isManualActive = pathname.startsWith(`/exam/${examId}/manual`);
  $: isStatsActive = pathname.startsWith(`/exam/${examId}/stats`);
</script>

<div
  class="box-border flex min-h-0 w-full max-w-full flex-1 flex-col {isGradeActive
    ? 'h-full p-0'
    : 'p-3 lg:p-5'}"
>
  {#if exam && !isGradeActive}
    <ExamNav
      {exam}
      {examId}
      {submissionCount}
      {isSetupActive}
      {isScanActive}
      {isVerifyActive}
      {isGradeActive}
      {isManualActive}
      {isStatsActive}
    />
  {/if}

  <div class="flex min-h-0 w-full flex-1 flex-col">
    <slot />
  </div>
</div>
