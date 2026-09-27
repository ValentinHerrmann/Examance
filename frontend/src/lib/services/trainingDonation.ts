/**
 * Opt-in donation of anonymous, teacher-verified checkbox crops to the configured backend
 * (training data for a shared MC-box classifier — see docs/data_flow_and_security.md).
 *
 * Privacy rules this file enforces — keep them:
 *  - nothing is sent unless `trainingDonationStore.enabled` (off by default);
 *  - only questions a teacher has verified (`isMcReviewed`) are donated;
 *  - requests go out with `credentials: 'omit'` and outside `api/client.ts`, so no session
 *    cookie links a donation to an account (and a 429 here never trips the login lockout);
 *  - samples carry no identifiers (`omrTrainingSample.ts`), and the batch is shuffled across
 *    questions so request order does not group a pupil's boxes;
 *  - failures are dropped, never queued for retry.
 */
import { get } from 'svelte/store';
import type { ExerciseScoreRecord } from '$lib/db/schema';
import { isMcReviewed } from '$lib/grading/mcVerification';
import {
  buildTrainingSamples,
  donationLabel,
  type OmrTrainingSampleIn,
} from '$lib/grading/omrTrainingSample';
import { scoreRepository } from '$lib/repositories/scoreRepository';
import { backendStore } from '$lib/stores/backendStore';
import { sessionStore } from '$lib/stores/session';
import { trainingDonationStore } from '$lib/stores/trainingDonation';

/** Upload once this many samples are waiting (a question has 2–5 boxes). */
const BATCH_SIZE = 20;
/** Server limit per request (backend/app/schemas/training.py). */
const MAX_PER_REQUEST = 100;

interface Staged {
  examId: string;
  record: ExerciseScoreRecord;
  scanPdfBytes: Uint8Array;
}

interface Pending {
  samples: OmrTrainingSampleIn[];
  examId: string;
  submissionId: string;
  exerciseId: string;
  label: string;
}

const staged = new Map<string, Staged>();
let outbox: Pending[] = [];
let uploading: Promise<void> | null = null;
let availability: Promise<boolean> | null = null;

const keyOf = (submissionId: string, exerciseId: string) => `${submissionId}:${exerciseId}`;

function apiBase(): string | null {
  const url = get(backendStore);
  return url ? `${url.replace(/\/$/, '')}/api/v1` : null;
}

/** Whether the configured backend accepts donations. Cached per page load. */
export function fetchDonationAvailable(): Promise<boolean> {
  if (!availability) {
    const base = apiBase();
    availability = !base
      ? Promise.resolve(false)
      : fetch(`${base}/training/status`, { credentials: 'omit' })
          .then((r) => (r.ok ? r.json() : { enabled: false }))
          .then((body: { enabled?: boolean }) => body.enabled === true)
          .catch(() => false);
  }
  return availability;
}

/**
 * Remember the latest save of a question (every click saves; the last one wins). Nothing is
 * built or sent until the teacher leaves the question — see `flushQuestion`.
 */
export function stageVerifiedQuestion(
  examId: string,
  record: ExerciseScoreRecord,
  scanPdfBytes: Uint8Array | null
): void {
  if (!get(trainingDonationStore).enabled || !scanPdfBytes) return;
  const key = keyOf(record.submissionId, record.exerciseId);
  if (!isMcReviewed(record.omrMeta)) {
    staged.delete(key); // e.g. "restore original" undid the verification
    return;
  }
  staged.set(key, { examId, record, scanPdfBytes });
}

/** The teacher left this question: turn its staged save into samples. */
export async function flushQuestion(submissionId: string, exerciseId: string): Promise<void> {
  const key = keyOf(submissionId, exerciseId);
  const entry = staged.get(key);
  staged.delete(key);
  if (!entry || !get(trainingDonationStore).enabled) return;
  const { record } = entry;
  const omrMeta = record.omrMeta;
  if (!omrMeta || !isMcReviewed(omrMeta)) return;

  const label = donationLabel(record.selectedOptions ?? []);
  if (omrMeta.donation?.label === label) return; // already donated with this verified answer

  try {
    const samples = await buildTrainingSamples(entry.scanPdfBytes, omrMeta, record.selectedOptions ?? []);
    if (samples.length === 0) return;
    outbox.push({ samples, examId: entry.examId, submissionId, exerciseId, label });
  } catch (err) {
    console.warn('[donation] could not build training samples:', (err as Error)?.message);
    return;
  }
  if (outbox.reduce((n, p) => n + p.samples.length, 0) >= BATCH_SIZE) void upload();
}

/** Page is going away: flush every staged question and send whatever is waiting. */
export async function flushAll(): Promise<void> {
  for (const key of [...staged.keys()]) {
    const [submissionId, exerciseId] = key.split(':');
    await flushQuestion(submissionId, exerciseId);
  }
  await upload();
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function upload(): Promise<void> {
  if (uploading) return uploading;
  uploading = (async () => {
    const batch = outbox;
    outbox = [];
    if (batch.length === 0) return;
    const base = apiBase();
    if (!base || !(await fetchDonationAvailable())) return;

    const samples = shuffle(batch.flatMap((p) => p.samples));
    for (let i = 0; i < samples.length; i += MAX_PER_REQUEST) {
      try {
        const res = await fetch(`${base}/training/omr-samples`, {
          method: 'POST',
          credentials: 'omit',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ samples: samples.slice(i, i + MAX_PER_REQUEST) }),
        });
        if (!res.ok) return; // dropped by design; the questions stay undonated
      } catch {
        return;
      }
    }
    for (const p of batch) await markDonated(p);
  })().finally(() => {
    uploading = null;
  });
  return uploading;
}

/** Record the donation on the (sealed) score row so it is never sent twice. */
async function markDonated(p: Pending): Promise<void> {
  const key = get(sessionStore).sessionKey;
  try {
    const rows = await scoreRepository.getBySubmissionId(p.examId, p.submissionId, key);
    const row = rows.find((r) => r.exerciseId === p.exerciseId);
    if (!row?.omrMeta || donationLabel(row.selectedOptions ?? []) !== p.label) return;
    await scoreRepository.saveOne(
      p.examId,
      { ...row, omrMeta: { ...row.omrMeta, donation: { at: new Date().toISOString(), label: p.label } } },
      key
    );
  } catch (err) {
    console.warn('[donation] could not record donation:', (err as Error)?.message);
  }
}
