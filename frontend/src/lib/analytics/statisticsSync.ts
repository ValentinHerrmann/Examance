/** Keeps each exam's statistics record current (issue #238, docs/dev/statistics_snapshots.md): debounced rebuilds after result writes, plus a one-time backfill per account and browser. */
import { get } from 'svelte/store';
import { loadExamEncrypted, loadExamExercisesEncrypted } from '#lib/db/dbEncryption';
import { examRepository } from '#lib/repositories/examRepository';
import { scoreRepository } from '#lib/repositories/scoreRepository';
import { submissionRepository } from '#lib/repositories/submissionRepository';
import { statisticsRepository } from '#lib/repositories/statisticsRepository';
import { sessionStore } from '#lib/stores/session';
import { workspaceIdStore, workspaceStatusStore } from '#lib/stores/workspaceState';
import { safeLocalStorage } from '#lib/utils/storage';
import { db } from '#lib/db/db';
import { resultsAreLocal } from '#lib/stores/storagePolicy';
import { onStatisticsDirty } from './statisticsDirty';
import { buildStatisticsSnapshot } from './statisticsSnapshot';
import { hasUnreadable, rebuildAction } from './statisticsRebuild';

const DEBOUNCE_MS = 3000;
const BACKFILL_KEY = 'bg_statistics_backfill_v1';

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let started = false;
let backfillRunning: Promise<void> | null = null;
// Exams this browser held local results for when a write marked them (hybrid): only then may an empty rebuild clear the record.
const hadLocalRows = new Set<string>();

/** Only a teaching session with an open workspace writes statistics (never admins, never locked tabs). */
function activeKey(): CryptoKey | null {
  if (get(workspaceStatusStore).state !== 'ok') return null;
  return get(sessionStore).sessionKey ?? null;
}

/** Rebuilds the exam's record from its results wherever the mode keeps them, unless this view is partial (see `rebuildAction`); `clearWhenEmpty` marks a rebuild after the teacher's own write. Resolves false when unreadable rows held the rebuild back. */
export async function refreshStatistics(examId: string, { clearWhenEmpty = false } = {}): Promise<boolean> {
  const key = activeKey();
  const hadRows = hadLocalRows.delete(examId);
  if (!key) return true;
  const exam = await loadExamEncrypted(examId, key);
  if (!exam) return true;
  const local = resultsAreLocal();
  const [exercises, submissions, scores] = await Promise.all([
    loadExamExercisesEncrypted(examId, key),
    submissionRepository.getByExamId(examId, key),
    scoreRepository.getByExamId(examId, key),
  ]);
  const snapshot = buildStatisticsSnapshot(exam, exercises, submissions, scores);
  const unreadable = hasUnreadable(exam, exercises, submissions, scores);
  const view = { local, purged: Boolean(exam.resultsPurgedAt), hasRows: submissions.length > 0, graded: snapshot !== null, hadRows, clearWhenEmpty };
  const action = rebuildAction({ ...view, unreadable });
  // Warn only when the unreadable rows are what held the rebuild back.
  if (unreadable && rebuildAction({ ...view, unreadable: false }) !== 'skip') {
    console.warn(`[statistics] exam ${examId} not rebuilt: some of its data could not be read`);
    return false;
  }
  if (action === 'put' && snapshot) await statisticsRepository.put(snapshot, key);
  else if (action === 'delete') {
    const stored = await statisticsRepository.findByExam(examId, key);
    if (stored) await statisticsRepository.delete(stored.id);
  }
  return true;
}

function run(examId: string): void {
  refreshStatistics(examId, { clearWhenEmpty: true }).catch((err) => console.warn(`[statistics] exam ${examId} not updated:`, err));
}

function schedule(examId: string): void {
  // Writers mark before they write, so this count still sees the rows a delete is about to remove.
  if (resultsAreLocal()) {
    db.submissions.where('examId').equals(examId).count().then((n) => { if (n > 0) hadLocalRows.add(examId); }).catch(() => {});
  }
  clearTimeout(timers.get(examId));
  timers.set(
    examId,
    setTimeout(() => {
      timers.delete(examId);
      run(examId);
    }, DEBOUNCE_MS),
  );
}

/** Starts every pending rebuild now (the tab is being hidden or closed), so the last grading changes still reach the record. */
function flushPending(): void {
  for (const [examId, timer] of timers) {
    clearTimeout(timer);
    run(examId);
  }
  timers.clear();
}

/** Writes a record for every exam whose results are readable here and that has none yet; marked done per workspace once it ran through. */
async function backfill(): Promise<void> {
  const key = activeKey();
  const workspaceId = get(workspaceIdStore);
  if (!key || !workspaceId) return;
  const flag = `${BACKFILL_KEY}:${workspaceId}`;
  if (safeLocalStorage.getItem(flag) === 'done') return;
  const [exams, stored] = await Promise.all([examRepository.getAll(key), statisticsRepository.list(key)]);
  const covered = new Set(stored.map((r) => r.examId));
  let failed = false;
  for (const exam of exams) {
    if (covered.has(exam.id)) continue;
    // One unreadable exam must not stop the others; the backfill then runs again on the next open, also after a rebuild held back by unreadable rows.
    const complete = await refreshStatistics(exam.id).catch((err) => { // NOSONAR: one exam at a time keeps the load small
      console.warn(`[statistics] backfill skipped exam ${exam.id}:`, err);
      return false;
    });
    if (!complete) failed = true;
  }
  if (!failed) safeLocalStorage.setItem(flag, 'done');
}

/** Called once by the root layout; listens for result writes and runs the backfill when a workspace opens. */
export function startStatisticsSync(): () => void {
  if (started) return () => {};
  started = true;
  onStatisticsDirty(schedule);
  const onHidden = () => {
    if (document.visibilityState === 'hidden') flushPending();
  };
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', flushPending);
  const unsubscribe = workspaceStatusStore.subscribe((status) => {
    if (status.state !== 'ok' || backfillRunning) return;
    backfillRunning = backfill()
      .catch((err) => console.warn('[statistics] backfill stopped:', err))
      .finally(() => (backfillRunning = null));
  });
  return () => {
    started = false;
    onStatisticsDirty(null);
    unsubscribe();
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', flushPending);
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}
