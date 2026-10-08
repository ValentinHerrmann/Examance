/**
 * Opt-in donation of teacher-verified checkbox crops (see docs/data_flow_and_security.md). Privacy rules, keep them: send only
 * when opted in (default off) AND signed in, only `isMcReviewed` questions, with a random per-box token (the account counts
 * for the daily quota only, never stored with a sample); drop unsent data on withdrawal/sign-out, never retry failures.
 */
import { get } from 'svelte/store';
import { api } from '#lib/api/client';
import type { ExerciseScoreRecord } from '#lib/db/schema';
import { isMcReviewed } from '#lib/grading/mcVerification';
import {
  buildTrainingSamples,
  donationLabel,
  donationTokens,
  type OmrTrainingSampleIn,
} from '#lib/grading/omrTrainingSample';
import { scoreRepository } from '#lib/repositories/scoreRepository';
import { backendStore } from '#lib/stores/backendStore';
import { isAuthenticated, sessionStore } from '#lib/stores/session';
import { trainingDonationStore } from '#lib/stores/trainingDonation';

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
  tokens: Record<number, string>;
}

export interface DonationStatus {
  /** The configured backend accepts donations. */
  enabled: boolean;
  /** Its retention period for donated samples, for the privacy notice. */
  retentionDays: number | null;
}

const staged = new Map<string, Staged>();
let outbox: Pending[] = [];
let uploading: Promise<void> | null = null;
let status: { url: string; promise: Promise<DonationStatus> } | null = null;
/** Tokens handed out this page session, by question — survives a row saved from a stale copy. */
const knownTokens = new Map<string, Record<number, string>>();

const keyOf = (submissionId: string, exerciseId: string) => `${submissionId}:${exerciseId}`;

/** Opted in and signed in: the only state in which anything may be built or sent. */
function active(): boolean {
  return get(trainingDonationStore).enabled && get(isAuthenticated);
}

function dropPending(): void {
  staged.clear();
  outbox = [];
}

// Consent withdrawn (here or in another tab — the store follows `storage` events) or signed
// out: nothing that was waiting may still go out.
trainingDonationStore.subscribe((consent) => {
  if (!consent.enabled) dropPending();
});
isAuthenticated.subscribe((signedIn) => {
  if (!signedIn) dropPending();
});

/** Whether the configured backend accepts donations. Public; cached per backend URL. */
export function fetchDonationStatus(): Promise<DonationStatus> {
  const url = get(backendStore);
  if (!status || status.url !== url) {
    const off: DonationStatus = { enabled: false, retentionDays: null };
    status = {
      url,
      promise: !url
        ? Promise.resolve(off)
        : fetch(`${url.replace(/\/$/, '')}/api/v1/training/status`, { credentials: 'omit' })
            .then((r) => (r.ok ? r.json() : {}))
            .then((body: { enabled?: boolean; retention_days?: number }) => ({
              enabled: body.enabled === true,
              retentionDays: typeof body.retention_days === 'number' ? body.retention_days : null,
            }))
            .catch(() => off),
    };
  }
  return status.promise;
}

export async function fetchDonationAvailable(): Promise<boolean> {
  return (await fetchDonationStatus()).enabled;
}

/** Remember the latest save of a question (every click saves; last wins). Nothing is built or sent until the teacher leaves it; see `flushQuestion`. */
export function stageVerifiedQuestion(
  examId: string,
  record: ExerciseScoreRecord,
  scanPdfBytes: Uint8Array | null
): void {
  if (!active() || !scanPdfBytes) return;
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
  if (!entry || !active()) return;
  const { record } = entry;
  const omrMeta = record.omrMeta;
  if (!omrMeta || !isMcReviewed(omrMeta)) return;

  const selected = record.selectedOptions ?? [];
  const label = donationLabel(selected);
  if (omrMeta.donation?.label === label) return; // already donated with this verified answer

  // A not-yet-sent donation of the same question is superseded by this one.
  const prior = outbox.find((p) => p.submissionId === submissionId && p.exerciseId === exerciseId);
  outbox = outbox.filter((p) => p !== prior);
  const tokens = donationTokens(omrMeta, { ...knownTokens.get(key), ...prior?.tokens });
  knownTokens.set(key, tokens);

  try {
    const samples = await buildTrainingSamples(entry.scanPdfBytes, omrMeta, selected, tokens);
    if (samples.length === 0 || !active()) return;
    outbox.push({ samples, examId: entry.examId, submissionId, exerciseId, label, tokens });
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

/** Sends the outbox in requests of whole questions (≤ MAX_PER_REQUEST samples each). An upload
 *  already running picks up what is added meanwhile. */
async function upload(): Promise<void> {
  if (uploading) return uploading;
  uploading = (async () => {
    while (outbox.length > 0) {
      if (!active() || !(await fetchDonationAvailable())) {
        outbox = [];
        return;
      }
      const chunk: Pending[] = [outbox.shift() as Pending];
      let n = chunk[0].samples.length;
      while (outbox.length > 0 && n + outbox[0].samples.length <= MAX_PER_REQUEST) {
        const next = outbox.shift() as Pending;
        chunk.push(next);
        n += next.samples.length;
      }
      if (!active()) {
        outbox = [];
        return;
      }
      try {
        await api.post(
          '/training/omr-samples',
          { samples: shuffle(chunk.flatMap((p) => p.samples)) },
          { silentError: true }
        );
      } catch {
        continue; // dropped by design; these questions stay undonated
      }
      for (const p of chunk) await markDonated(p);
    }
  })().finally(() => {
    uploading = null;
  });
  return uploading;
}

/** Record the donation on the sealed score row: tokens always (later donations of the same boxes must reuse them), the label only if unchanged since. */
async function markDonated(p: Pending): Promise<void> {
  const key = get(sessionStore).sessionKey;
  try {
    const rows = await scoreRepository.getBySubmissionId(p.examId, p.submissionId, key);
    const row = rows.find((r) => r.exerciseId === p.exerciseId);
    if (!row?.omrMeta) return;
    const previous = row.omrMeta.donation ?? {};
    const sameLabel = donationLabel(row.selectedOptions ?? []) === p.label;
    await scoreRepository.saveOne(
      p.examId,
      {
        ...row,
        omrMeta: {
          ...row.omrMeta,
          donation: {
            ...previous,
            tokens: { ...previous.tokens, ...p.tokens },
            ...(sameLabel ? { at: new Date().toISOString(), label: p.label } : {}),
          },
        },
      },
      key
    );
  } catch (err) {
    console.warn('[donation] could not record donation:', (err as Error)?.message);
  }
}
