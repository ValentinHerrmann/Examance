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
import { onStatisticsDirty } from './statisticsDirty';
import { buildStatisticsSnapshot } from './statisticsSnapshot';

const DEBOUNCE_MS = 3000;
const BACKFILL_KEY = 'bg_statistics_backfill_v1';

const timers = new Map<string, ReturnType<typeof setTimeout>>();
let started = false;
let backfillRunning: Promise<void> | null = null;

/** Only a teaching session with an open workspace writes statistics (never admins, never locked tabs). */
function activeKey(): CryptoKey | null {
  if (get(workspaceStatusStore).state !== 'ok') return null;
  return get(sessionStore).sessionKey ?? null;
}

/** Rebuilds the exam's record from its results wherever the mode keeps them; `clearWhenEmpty` (a teacher's own delete emptied the exam) drops it, the backfill never does. */
export async function refreshStatistics(examId: string, { clearWhenEmpty = false } = {}): Promise<void> {
  const key = activeKey();
  if (!key) return;
  const exam = await loadExamEncrypted(examId, key);
  if (!exam) return;
  const [exercises, submissions, scores] = await Promise.all([
    loadExamExercisesEncrypted(examId, key),
    submissionRepository.getByExamId(examId, key),
    scoreRepository.getByExamId(examId, key),
  ]);
  const snapshot = buildStatisticsSnapshot(exam, exercises, submissions, scores);
  if (snapshot) return statisticsRepository.put(snapshot, key);
  if (!clearWhenEmpty) return;
  const stored = await statisticsRepository.findByExam(examId, key);
  if (stored) await statisticsRepository.delete(stored.id);
}

function schedule(examId: string): void {
  clearTimeout(timers.get(examId));
  timers.set(
    examId,
    setTimeout(() => {
      timers.delete(examId);
      refreshStatistics(examId, { clearWhenEmpty: true }).catch((err) => console.warn(`[statistics] exam ${examId} not updated:`, err));
    }, DEBOUNCE_MS),
  );
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
  for (const exam of exams) {
    if (!covered.has(exam.id)) await refreshStatistics(exam.id); // NOSONAR: one exam at a time keeps the load small
  }
  safeLocalStorage.setItem(flag, 'done');
}

/** Called once by the root layout; listens for result writes and runs the backfill when a workspace opens. */
export function startStatisticsSync(): () => void {
  if (started) return () => {};
  started = true;
  onStatisticsDirty(schedule);
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
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
  };
}
