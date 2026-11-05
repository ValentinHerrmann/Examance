<script lang="ts">
  import { page } from "$app/state";
  import { onDestroy, untrack } from "svelte";
  import type { Snippet } from "svelte";
  import { browser } from "$app/env";
  import { afterNavigate } from "$app/navigation";
  import { get } from "svelte/store";
  import { sessionStore } from "#lib/stores/session";
  import { submissionRepository } from "#lib/repositories/submissionRepository";
  import type { ExamRecord } from "#lib/db/schema";
  import { examNavContext, examMcState, examChecksState } from "#lib/stores/shell";
  import { loadExamEncrypted, loadExamExercisesEncrypted } from "#lib/db/dbEncryption";
  import { studentRepository } from "#lib/repositories/studentRepository";
  import { listResultDeliveries, listResultShares } from "#lib/api/resultShares";
  import { latestDeliveries, undelivered } from "#lib/sharing/shareService";
  import { featuresStore } from "#lib/stores/capabilities";
  import { examProgress, type ExamProgressInput } from "#lib/exam/examProgress";
  import { contentStamp, mcStatus, printStamps, printStatus, studentsStamp } from "#lib/exam/examChecks";
  import { printSettingsOf } from "#lib/exam/printLayout";
  import { computeMcVerificationStats, summarizeMcCheck } from "#lib/grading/mcVerification";
  import { t } from "#lib/i18n";

  interface Props {
    params?: Record<string, string>;
    children?: Snippet;
  }

  let { children }: Props = $props();

  let examId = $derived(page.params.id || "");
  let pathname = $derived(page.url.pathname);

  // Raw: the record is handed to examNavContext, which must not receive a proxy.
  let exam: ExamRecord | null = $state.raw(null);
  let submissionCount = $state(0);
  // Raw: handed to the store like the record. Each count is read on its own, so a failed read drops only its badge.
  let counts: ExamProgressInput = $state.raw({});

  afterNavigate(() => {
    if (examId && $sessionStore.sessionKey) {
      loadExamHeaderData(examId);
    }
  });

  async function attempt<T>(read: () => Promise<T>): Promise<T | undefined> {
    try {
      return await read();
    } catch (e) {
      console.error(e);
      return undefined;
    }
  }

  async function loadExamHeaderData(id: string) {
    const key = get(sessionStore).sessionKey;
    const next: ExamProgressInput = {};
    exam = (await attempt(() => loadExamEncrypted(id, key))) || null;
    const subs = await attempt(() => submissionRepository.getByExamId(id, key));
    // The counts are only sidebar badges: a failed read hides its badge (never a stale or zero count); each page reports its own failed reads.
    submissionCount = subs?.length ?? 0;
    if (subs) {
      next.submissionCount = subs.length;
      next.gradedCount = subs.filter((s) => typeof s.totalScore === "number" && !isNaN(s.totalScore)).length;
    }
    const exercises = await attempt(() => loadExamExercisesEncrypted(id, key));
    next.exerciseCount = exercises?.length;
    const students = await attempt(() => studentRepository.getByExamId(id, key));
    next.studentCount = students?.length;
    const stamps = exam && exercises && students ? { content: contentStamp(exam, exercises), students: studentsStamp(students) } : null;
    const checks = exam?.stepChecks ?? {};
    const shares = await attempt(() => listResultShares(id));
    // Students with a link that still opens; a replaced link leaves an older row, so count students, not rows.
    if (shares) next.sharedCount = new Set(shares.filter((sh) => Date.parse(sh.expiresAt) > Date.now()).map((sh) => sh.studentKey)).size;
    if (get(featuresStore).result_delivery) {
      const deliveries = await attempt(() => listResultDeliveries(id));
      if (deliveries) next.notReached = [...latestDeliveries(deliveries).values()].filter(undelivered).length;
    }
    // Only a read of the scans' MC items tells what is open; a page visit never does. No scans or no MC question: no badge.
    const mc = subs && subs.length > 0 ? await attempt(() => computeMcVerificationStats(id, key)) : undefined;
    if (id === examId) {
      counts = next;
      examChecksState.set({ examId: id, checks, stamps });
      examMcState.set(mc && mc.totalQuestions > 0 ? { examId: id, ...summarizeMcCheck(mc.items) } : null);
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

  // The sidebar and the phone drawer live in the app shell (so they do not scroll with the page); this layout only tells them which exam is open.
  $effect.pre(() => {
    const id = examId;
    const current = exam;
    const count = submissionCount;
    const input = counts;
    const mc = $examMcState;
    const cs = $examChecksState;
    if (browser && id) {
      const progress = examProgress({
        ...input,
        verify: mc && mc.examId === id ? mcStatus(mc, cs?.examId === id ? cs.checks : null) : undefined,
        print: cs && cs.examId === id && cs.stamps ? printStatus(cs.checks, printStamps(cs.stamps.content, cs.stamps.students, current ? printSettingsOf(current) : undefined), current?.printMode) : undefined,
      });
      untrack(() => examNavContext.set({ examId: id, exam: current && current.id === id ? current : null, submissionCount: count, progress }));
    }
  });
</script>

<!-- Size container (columns follow `@3xl:` container variants, not the viewport). The grade page fills the space above the footer; other pages grow so the main area scrolls. -->
<div class="@container flex w-full min-w-0 flex-col {isGradeActive ? 'min-h-0 flex-1' : 'grow'}">
  {@render children?.()}
</div>
