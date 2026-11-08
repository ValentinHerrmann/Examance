/** Pinned OMR templates (issue #239, docs/dev/omr.md): the answer-sheet layout captured when an exam is printed, sealed on the server, so sheets printed before a later edit or update are still read where their boxes really are. The one place that reads, writes and chooses pins. */
import { loadOmrTemplateEncrypted, openOmrTemplatePin, sealOmrTemplatePin } from "#lib/db/dbEncryption";
import { api } from "#lib/api/client";
import { base64ToUint8Array, uint8ArrayToBase64 } from "#lib/crypto/aesGcm";
import { enqueueOrThrow } from "#lib/services/offlineQueue";
import type { OmrPinSource, OmrTemplateCandidate } from "./omrTemplateChoice";
import { computeOmrTemplateHash, prepareOmrTemplate, type ExamCompileContext, type ExamItemRef } from "./omrTemplatePrep";

interface PinRow {
  layout_hash: string;
  source: OmrPinSource;
  pinned_at: string;
  last_pinned_at: string;
  payload_ciphertext_b64: string;
  payload_iv_b64: string;
}

type LayoutContext = ExamCompileContext & { examItems?: ExamItemRef[] };

const pinsPath = (examId: string) => `/exams/${examId}/omr-template-pins`;

/** The exam's pins, newest first; a pin that does not open is skipped (logged), never shown as another layout. Throws on a failed read. */
export async function listOmrTemplatePins(examId: string, key: CryptoKey | null): Promise<OmrTemplateCandidate[]> {
  const rows = await api.get<PinRow[]>(pinsPath(examId), { silentError: true });
  const pins: OmrTemplateCandidate[] = [];
  for (const row of rows ?? []) {
    try {
      const payload = await openOmrTemplatePin(examId, row.layout_hash, base64ToUint8Array(row.payload_ciphertext_b64), base64ToUint8Array(row.payload_iv_b64), key); // NOSONAR: a handful of small pins
      pins.push({ hash: row.layout_hash, pinnedAt: row.pinned_at, source: row.source, payload });
    } catch (err) {
      console.warn(`[omrPins] pin ${row.layout_hash} did not open:`, err);
    }
  }
  return pins.sort((a, b) => (b.pinnedAt ?? "").localeCompare(a.pinnedAt ?? ""));
}

/** The current layout's template: the stored one while its hash matches, else a fresh capture. Throws with the reason when none can be made. */
export async function loadCurrentOmrTemplate(examId: string, key: CryptoKey | null, ctx: LayoutContext, onProgress?: (msg: string) => void): Promise<OmrTemplateCandidate> {
  const existing = await loadOmrTemplateEncrypted(examId, key);
  const hash = await computeOmrTemplateHash(ctx);
  if (existing?.payload && existing.record.exercisesHash === hash) return { hash, payload: existing.payload };
  const res = await prepareOmrTemplate({ ...ctx, examId, key, onProgress });
  if (res.status === "stale") throw new Error(res.message);
  return { hash: res.exercisesHash, payload: res.payload };
}

// Pins sent from this tab, so a download followed by the tick does not capture and send twice.
const sentThisTab = new Set<string>();

/** Pins the current layout as printed; the server keeps the first pin of a layout and its time. Returns null for exams that print no scan aids. */
export async function pinOmrTemplate(ctx: LayoutContext, source: OmrPinSource, key: CryptoKey | null): Promise<OmrTemplateCandidate | null> {
  const examId = ctx.exam.id;
  if (ctx.exam.digitalGrading === false || ctx.exercises.length === 0) return null;
  if (ctx.exercises.some((ex) => ex.codeWithheld)) return null;
  const current = await loadCurrentOmrTemplate(examId, key, ctx);
  const sentKey = `${examId}:${current.hash}`;
  if (sentThisTab.has(sentKey)) return current;
  const { ct, iv } = await sealOmrTemplatePin(examId, current.hash, current.payload, key);
  const path = `${pinsPath(examId)}/${current.hash}`;
  const body = { source, payload_ciphertext_b64: uint8ArrayToBase64(ct), payload_iv_b64: uint8ArrayToBase64(iv) };
  try {
    await api.put(path, body, { silentError: true });
  } catch (err) {
    enqueueOrThrow(err, path, "PUT", body);
  }
  sentThisTab.add(sentKey);
  return { ...current, source, pinnedAt: new Date().toISOString() };
}

/** Removes a pin (a test print that was never handed out). */
export async function deleteOmrTemplatePin(examId: string, hash: string): Promise<void> {
  await api.delete(`${pinsPath(examId)}/${hash}`);
  sentThisTab.delete(`${examId}:${hash}`);
}

export interface OmrCandidatesResult {
  /** Pins newest first, then the current layout unless it is pinned already. */
  candidates: OmrTemplateCandidate[];
  pinsError?: string;
  currentError?: string;
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Every template a scan of this exam may have been printed with; a failed pin read or capture is reported, the rest still serves. */
export async function loadOmrTemplateCandidates(examId: string, key: CryptoKey | null, ctx: LayoutContext | null, onProgress?: (msg: string) => void): Promise<OmrCandidatesResult> {
  const out: OmrCandidatesResult = { candidates: [] };
  try {
    out.candidates = await listOmrTemplatePins(examId, key);
  } catch (err) {
    out.pinsError = messageOf(err);
  }
  if (!ctx) return out;
  try {
    const current = await loadCurrentOmrTemplate(examId, key, ctx, onProgress);
    if (!out.candidates.some((c) => c.hash === current.hash)) out.candidates.push(current);
  } catch (err) {
    out.currentError = messageOf(err);
  }
  return out;
}

/** Whether the newest pin differs from the current layout (Exam step and verify note). */
export interface OmrPinState {
  pinnedAt: string;
  differs: boolean;
}

export async function omrPinState(ctx: LayoutContext, key: CryptoKey | null): Promise<OmrPinState | null> {
  const pins = await listOmrTemplatePins(ctx.exam.id, key);
  if (pins.length === 0) return null;
  const hash = await computeOmrTemplateHash(ctx);
  return { pinnedAt: pins[0].pinnedAt ?? "", differs: pins[0].hash !== hash };
}
