<script lang="ts">
  import { isUnlocked, isAuthenticated, sessionStore } from '$lib/stores/session';
  import { db } from '$lib/db/db';
  import type { ExamRecord } from '$lib/db/schema';
  import { loadExamsEncrypted, saveExamEncrypted, encryptExam, encryptExercise } from '$lib/db/dbEncryption';
  import { unpackProject } from '$lib/archive/unpacker';
  import { formatImportSummary } from '$lib/services/archiveService';
  import { clearAllTables } from '$lib/db/db';
  import { projectStore } from '$lib/stores/project';
  import { checkRetention, type RetentionCheckResult } from '$lib/gdpr/retention';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';

  import { storagePolicyStore } from '$lib/stores/storagePolicy';
  import { api } from '$lib/api/client';
  import { examRepository, mapApiToExamRecord } from '$lib/repositories/examRepository';
  import { submissionRepository } from '$lib/repositories/submissionRepository';
  import { offlineQueue } from '$lib/services/offlineQueue';
  import { goto } from '$app/navigation';
  import { t, translate } from '$lib/i18n';

  import DashboardSessionState from '$lib/components/dashboard/DashboardSessionState.svelte';
  import DashboardHeader from '$lib/components/dashboard/DashboardHeader.svelte';
  import KpiSidebar from '$lib/components/dashboard/KpiSidebar.svelte';
  import RetentionModal from '$lib/components/dashboard/RetentionModal.svelte';
  import OnboardingEmptyState from '$lib/components/dashboard/OnboardingEmptyState.svelte';
  import DashboardFilterBar from '$lib/components/dashboard/DashboardFilterBar.svelte';
  import ExamGrid from '$lib/components/dashboard/ExamGrid.svelte';
  import { PageShell } from '$lib/components/ui';


  let exams: ExamRecord[] = [];
  /** Set when the server refused the exam list, so the view can say so. */
  let examsLoadFailed = false;
  let examStatsMap = new Map<string, { avgScore: number | null; count: number }>();
  let isImporting = false;
  let importStatus = '';
  let isInitializing = true;
  let expiredExam: { exam: ExamRecord; check: RetentionCheckResult } | null = null;

  let searchQuery = '';
  let selectedGradeFilter = 'ALL';
  let selectedSubjectFilter = 'ALL';

  $: availableGrades = Array.from(
    new Set(exams.map((e) => e.grade).filter((g): g is string => Boolean(g)))
  ).sort();

  $: availableSubjects = Array.from(
    new Set(exams.map((e) => e.fach).filter((f): f is string => Boolean(f)))
  ).sort();

  $: filteredExams = exams.filter((e) => {
    const matchesGrade =
      selectedGradeFilter === 'ALL' ||
      e.grade === selectedGradeFilter ||
      (!e.grade && e.klasse === selectedGradeFilter);
    const matchesSubject = selectedSubjectFilter === 'ALL' || e.fach === selectedSubjectFilter;
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      (e.title && e.title.toLowerCase().includes(q)) ||
      (e.grade && e.grade.toLowerCase().includes(q)) ||
      (e.klasse && e.klasse.toLowerCase().includes(q)) ||
      (e.fach && e.fach.toLowerCase().includes(q)) ||
      (e.testart && e.testart.toLowerCase().includes(q));
    return matchesGrade && matchesSubject && matchesSearch;
  });

  onMount(async () => {
    try {
      if (!$isUnlocked) {
        goto("/unlock");
        return;
      }
      await refreshExams();
    } finally {
      isInitializing = false;
    }
  });

  async function refreshExams() {
    examsLoadFailed = false;
    const key = get(sessionStore).sessionKey;
    const localExams = await loadExamsEncrypted(key);

    if ($isAuthenticated && $storagePolicyStore.storageMode !== 'all-local') {
      try {
        // Silent: the catch below falls back to what is in IndexedDB and the
        // banner reports the failure in place. The global modal on top of that
        // is the same error told twice.
        const remoteExamsRaw = (await api.get('/exams', { silentError: true })) as any[];
        const remoteExams: ExamRecord[] = remoteExamsRaw.map(mapApiToExamRecord);

        // Check offline queue for pending exam creations
        const pendingQueue = get(offlineQueue);
        const pendingExamIds = new Set(
          pendingQueue
            .filter((req) => req.url === '/exams' && req.method === 'POST' && req.body?.id)
            .map((req) => req.body.id)
        );

        // Merge remote and local exams (preserve only local IDB exams pending offline sync)
        const remoteIds = new Set(remoteExams.map((e) => e.id));
        const pendingLocalExams = localExams.filter((e) => !remoteIds.has(e.id) && pendingExamIds.has(e.id));
        const deletedStaleExams = localExams.filter((e) => !remoteIds.has(e.id) && !pendingExamIds.has(e.id));

        // Purge deleted/stale exams from local IDB
        for (const stale of deletedStaleExams) {
          await db.exams.delete(stale.id);
          await db.exercises.where('examId').equals(stale.id).delete();
          await db.examExercises.where('examId').equals(stale.id).delete();
        }

        exams = [...remoteExams, ...pendingLocalExams];

        const encryptedExams = await Promise.all(exams.map((ex) => encryptExam(ex, key)));
        await db.exams.bulkPut(encryptedExams);


        // Also sync remote exercises, junction records and MC groups to IndexedDB
        // for offline export — nothing else writes these tables in all-server
        // mode, so without this a .bgproj export ships them empty.
        const remoteExercises: any[] = [];
        const junctionRecords: any[] = [];
        const mcGroupRecords: any[] = [];
        for (const e of remoteExamsRaw) {
          if (Array.isArray(e.mc_groups)) {
            for (const g of e.mc_groups) {
              mcGroupRecords.push({
                id: g.id,
                examId: e.id,
                title: g.title,
                scoringText: g.scoring_text,
                orderIndex: g.order_index,
              });
            }
          }
          if (Array.isArray(e.exercises)) {
            for (let idx = 0; idx < e.exercises.length; idx++) {
              const ex = e.exercises[idx];
              const orderIndex = ex.order_index ?? (idx + 1);
              remoteExercises.push({
                id: ex.id,
                teacherId: ex.teacher_id,
                name: ex.name,
                topicTag: ex.topic_tag,
                grade: ex.grade,
                subject: ex.subject,
                latexBody: ex.latex_body,
                maxPoints: ex.max_points,
                version: ex.version || 1,
                questionType: ex.question_type || 'free_text',
                penalty: ex.penalty || 0,
                exerciseGroupId: ex.exercise_group_id,
                variantKey: ex.variant_key,
                isCurrent: ex.is_current,
              });
              junctionRecords.push({
                examId: e.id,
                exerciseId: ex.id,
                orderIndex,
                // MC membership MUST be carried over. These records are written
                // with bulkPut on the [examId+exerciseId] primary key, so a
                // junction rebuilt without mcGroupId/subIndex overwrites the
                // stored one and erases the exercise's MC group membership —
                // after which the group renders empty and its members show up
                // as standalone exercises.
                mcGroupId: ex.mc_group_id ?? ex.mcGroupId ?? undefined,
                subIndex: ex.sub_index ?? ex.subIndex ?? undefined,
              });
            }
          }
        }
        if (remoteExercises.length > 0) {
          const encExercises = await Promise.all(remoteExercises.map((ex) => encryptExercise(ex, key)));
          await db.exercises.bulkPut(encExercises);
        }
        // Prune before writing: the server is authoritative for these tables in
        // server-backed modes, so a link or group it no longer knows about must
        // not survive locally and resurface as a phantom exercise/group.
        const syncedExamIds = remoteExamsRaw.map((e: any) => e.id).filter(Boolean);
        for (const syncedExamId of syncedExamIds) {
          const keptExerciseIds = new Set(
            junctionRecords.filter((j) => j.examId === syncedExamId).map((j) => j.exerciseId)
          );
          const staleLinks = await db.examExercises.where('examId').equals(syncedExamId).toArray();
          for (const link of staleLinks) {
            if (!keptExerciseIds.has(link.exerciseId)) {
              await db.examExercises.delete([syncedExamId, link.exerciseId]);
            }
          }
          const keptGroupIds = new Set(
            mcGroupRecords.filter((g) => g.examId === syncedExamId).map((g) => g.id)
          );
          const staleGroups = await db.examMcGroups.where('examId').equals(syncedExamId).toArray();
          for (const group of staleGroups) {
            if (!keptGroupIds.has(group.id)) {
              await db.examMcGroups.delete(group.id);
            }
          }
        }
        if (junctionRecords.length > 0) {
          await db.examExercises.bulkPut(junctionRecords);
        }
        if (mcGroupRecords.length > 0) {
          await db.examMcGroups.bulkPut(mcGroupRecords);
        }
      } catch (apiErr) {
        console.warn('Failed to fetch remote exams, falling back to IDB:', apiErr);
        // What is in IndexedDB, and an honest note that it is not everything.
        // In all-server mode nothing is cached there, so without the banner a
        // rejected request is indistinguishable from an empty account — which
        // is how a session problem read as "all my data is gone".
        exams = localExams;
        examsLoadFailed = true;
      }
    } else {
      exams = localExams;
    }

    try {
      const allSubmissions = await submissionRepository.getAll(key);
      const tempMap = new Map<string, { sum: number; count: number }>();
      for (const s of allSubmissions) {
        if (typeof s.totalScore === 'number' && !isNaN(s.totalScore)) {
          const curr = tempMap.get(s.examId) || { sum: 0, count: 0 };
          curr.sum += s.totalScore;
          curr.count += 1;
          tempMap.set(s.examId, curr);
        }
      }
      const newStats = new Map<string, { avgScore: number | null; count: number }>();
      for (const [eId, data] of tempMap.entries()) {
        if (data.count > 0) {
          newStats.set(eId, {
            avgScore: Math.round((data.sum / data.count) * 10) / 10,
            count: data.count,
          });
        }
      }
      examStatsMap = newStats;
    } catch (e) {
      console.warn('Could not load submission stats for dashboard:', e);
    }

    for (const exam of exams) {
      if (exam.retentionUntil) {
        const check = checkRetention(exam.retentionUntil);
        if (check.isExpired) {
          expiredExam = { exam, check };
          break;
        }
      }
    }
  }

  async function handleImportArchive(event: Event) {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const file = input.files[0];

    const password = prompt(translate('dashboard.importPasswordPrompt'));
    if (!password) return;

    isImporting = true;
    importStatus = translate('dashboard.importDecrypting');

    try {
      const buffer = new Uint8Array(await file.arrayBuffer());
      await clearAllTables();
      projectStore.clear();
      const res = await unpackProject(buffer, password, (p) => {
        importStatus = translate('dashboard.importStatus', { stage: p.stage, current: p.current });
      });



      alert(formatImportSummary(res));
      await refreshExams();
    } catch (err: any) {
      alert(translate('dashboard.importFailed', { message: err.message }));
    } finally {
      isImporting = false;
      importStatus = '';
      input.value = '';
    }
  }

  async function handleExtendRetention() {
    if (!expiredExam) return;
    const newDate = new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0];
    expiredExam.exam.retentionUntil = newDate;
    const key = get(sessionStore).sessionKey;
    await saveExamEncrypted(expiredExam.exam, key);
    expiredExam = null;
    await refreshExams();
  }

  async function handleDeleteExpiredExam() {
    if (!expiredExam) return;
    const examId = expiredExam.exam.id;

    // Collect submission IDs first to clean up exercise scores
    const submissionIds = (await db.submissions.where('examId').equals(examId).toArray()).map((s) => s.id);

    // Delete exercise scores for all submissions in this exam to prevent orphaned data
    for (const subId of submissionIds) {
      await db.exerciseScores.where('submissionId').equals(subId).delete();
    }

    await db.exams.delete(examId);
    await db.exercises.where('examId').equals(examId).delete();
    await db.examExercises.where('examId').equals(examId).delete();
    await db.submissions.where('examId').equals(examId).delete();
    await db.students.where('examId').equals(examId).delete();
    expiredExam = null;
    await refreshExams();
  }

  async function handleDeleteDashboardExam(id: string, title?: string) {
    if (
      !confirm(
        translate('dashboard.deleteExamConfirm', {
          title: title || translate('dashboard.deleteExamFallbackTitle'),
        })
      )
    )
      return;
    try {
      await examRepository.delete(id);
      await refreshExams();
    } catch (err: any) {
      alert(translate('dashboard.deleteFailed', { message: err.message }));
    }
  }

  function handleNavigateToExam(id: string) {
    goto(`/exam/${id}`);
  }
</script>

<PageShell width="full">
  {#if isInitializing}
    <DashboardSessionState mode="loading" />
  {:else if !$isUnlocked}
    <DashboardSessionState mode="locked" />
  {:else}
    <DashboardHeader {isImporting} {importStatus} onImportArchive={handleImportArchive} />

    <div class="grid min-w-0 grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,17.5rem)_minmax(0,1fr)]">
      <div class="order-last min-w-0 xl:order-none">
        <KpiSidebar
          totalExams={exams.length}
          subjectCount={availableSubjects.length}
          gradeCount={availableGrades.length}
        />
      </div>

      <div class="min-w-0">
        {#if expiredExam}
          <RetentionModal {expiredExam} onExtend={handleExtendRetention} onDelete={handleDeleteExpiredExam} />
        {/if}

        {#if examsLoadFailed}
          <p
            class="rounded-lg border border-line-strong bg-surface-sunken p-4 text-sm text-content"
            role="alert"
          >
            {$t("dashboard.loadFailed")}
          </p>
        {/if}

        {#if exams.length === 0 && !examsLoadFailed}
          <OnboardingEmptyState />
        {:else}
          <DashboardFilterBar
            bind:searchQuery
            bind:selectedGradeFilter
            bind:selectedSubjectFilter
            {availableGrades}
            {availableSubjects}
          />

          <ExamGrid
            exams={filteredExams}
            {examStatsMap}
            onNavigate={handleNavigateToExam}
            onDelete={handleDeleteDashboardExam}
          />
        {/if}
      </div>
    </div>
  {/if}
</PageShell>


