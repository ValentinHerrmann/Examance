/** Sharing graded PDFs with students (issue #207, docs/dev/result_sharing.md): render in the browser, seal per student, upload ciphertext only, print the slips. Results come through the repositories, so it works in both storage modes. */

import { get } from 'svelte/store';
import type { GradingState } from '#lib/analytics/examResults';
import { createResultShare, listResultShares, type ResultShareInfo } from '#lib/api/resultShares';
import { joinKeys } from '#lib/crypto/pseudonymKey';
import { personalKey } from '#lib/crypto/stickerKey';
import type { StudentRecord } from '#lib/db/schema';
import { forEachGradedPdf, loadResults } from '#lib/export/examExport';
import { exportDateStamp, slug } from '#lib/export/zip';
import { logExportAction } from '#lib/gdpr/exportAudit';
import { buildExamItems, loadExamCompileContext } from '#lib/grading/omrTemplatePrep';
import { compileExamPreview, examHasWithheldCode } from '#lib/exam/examPreview';
import { translate } from '#lib/i18n';
import type { Locale } from '#lib/i18n/types';
import { awaitSessionReady, sessionStore } from '#lib/stores/session';
import { randomCode } from '#lib/utils/randomCode';
import { formatStudentName, stickerRawOf } from '#lib/utils/studentQr';
import { incompatibleStudents, SHARE_CHANNELS, type ShareChannelId } from './channels';
import { createDelivery, type ArtemisTarget, type DeliveryFile } from './delivery';
import { lookupHash, lookupSecret, newShareLink, sealShare, shareUrl, type ShareFactor } from './shareCrypto';
import { renderShareSlips, type SlipEntry } from './slipsPdf';

export interface ShareStudent {
  student: StudentRecord;
  /** `joinKey` of the student: what a share is stored under. */
  key: string;
  name: string;
  state: GradingState;
  hasSubmission: boolean;
  share?: ResultShareInfo;
}

export interface ShareOverview {
  examTitle: string;
  students: ShareStudent[];
  /** Live shares whose student is no longer in the exam. */
  orphans: ResultShareInfo[];
  /** False when exercise texts are withheld: the solution cannot be built. */
  solutionAvailable: boolean;
}

export interface ShareRequest {
  examId: string;
  channel: ShareChannelId;
  factor: ShareFactor;
  expiryDays: number;
  /** `ShareStudent.key` of every student to share with. */
  studentKeys: ReadonlySet<string>;
  /** Add the exam's sample solution to every student's page. */
  includeSolution: boolean;
  /** Course, token and mode for the Artemis channel; the token is only passed on. */
  artemis?: ArtemisTarget;
  /** Language of the message to students (e-mail, Artemis). */
  language: Locale;
  /** Send the key or code along with the link (teacher's opt-in; weaker than a separate factor). */
  includeCode: boolean;
}

export interface ShareOutcome {
  shared: number;
  channel: ShareChannelId;
  warnings: string[];
  /** What the teacher saves: the slips or code slips PDF, or the Mebis ZIP. */
  download: DeliveryFile | null;
}

export const SHARE_EXPIRY_DAYS = [7, 14, 30, 90] as const;
export const DEFAULT_EXPIRY_DAYS = 30;

async function sessionKeys() {
  await awaitSessionReady();
  const { sessionKey: key, fallbackSessionKey } = get(sessionStore);
  if (!key) throw new Error(translate('dashboard.sessionState.lockedTitle'));
  return { key, fallbackSessionKey };
}

async function loadExam(examId: string, key: CryptoKey) {
  const ctx = await loadExamCompileContext(examId, key);
  if (!ctx) throw new Error(translate('exam.page.examNotFoundOrDeleted'));
  return ctx;
}

const displayName = (st: StudentRecord) => formatStudentName(st.studentName) || st.fallbackCode || '?';

/** The second secret of a share: the student's personal key from their sticker or exam copy, for the code factor too, so code slips double as a reprint of a lost key; a fresh code only for students without a sticker. */
export async function shareCode(factor: ShareFactor, raw: string | null): Promise<string | null> {
  if (factor === 'none') return null;
  if (raw) return personalKey(raw);
  return factor === 'code' ? randomCode(8) : null;
}

/** Students with their grading state and live share, for the dialog. */
export async function loadShareOverview(examId: string): Promise<ShareOverview> {
  const { key } = await sessionKeys();
  const ctx = await loadExam(examId, key);
  const [results, shares] = await Promise.all([loadResults({ ...ctx, key }), listResultShares(examId)]);
  const keys = await joinKeys(results.students);
  const shareByKey = new Map(shares.map((s) => [s.studentKey, s]));
  const students = results.students.map((student, i) => ({
    student,
    key: keys[i],
    name: displayName(student),
    state: results.rows[i].state,
    hasSubmission: Boolean(results.rows[i].submissionId),
    share: shareByKey.get(keys[i]),
  }));
  const known = new Set(keys);
  return {
    examTitle: ctx.exam.title ?? '',
    students,
    orphans: shares.filter((s) => !known.has(s.studentKey)),
    solutionAvailable: !examHasWithheldCode(ctx.exercises),
  };
}

/** Shares the chosen students' graded PDFs and returns the slips to print. A student who cannot be served, or whose PDF fails, becomes a warning. */
/** The sample solution as a PDF, or an error the dialog shows: a requested solution is never silently left out. */
async function compileSolution(ctx: Awaited<ReturnType<typeof loadExam>>, key: CryptoKey, warnings: string[]): Promise<Uint8Array> {
  if (examHasWithheldCode(ctx.exercises)) throw new Error(translate('sharing.share.solutionWithheld'));
  const res = await compileExamPreview({ ...ctx, examItems: buildExamItems(ctx.exercises, ctx.mcGroups), key });
  if (res.missingGraphics.length) {
    warnings.push(translate('export.exam.warnings.missingGraphics', { files: [...new Set(res.missingGraphics)].join(', ') }));
  }
  return res.loesung.pdfBytes;
}

/** *phase* names what runs: compiling the solution, preparing (encrypt and upload) links, sending (Artemis per student, e-mail per batch) or packing the Mebis ZIP; *done* of *total* counts finished ones. */
export type SharePhase = 'solution' | 'preparing' | 'sending' | 'packing';
export type ShareProgress = (phase: SharePhase, done?: number, total?: number) => void;

export async function shareResults(request: ShareRequest, progress: ShareProgress): Promise<ShareOutcome> {
  const { key, fallbackSessionKey } = await sessionKeys();
  const ctx = await loadExam(request.examId, key);
  const results = await loadResults({ ...ctx, key });
  const keys = await joinKeys(results.students);
  const channel = SHARE_CHANNELS.find((c) => c.id === request.channel);
  const examTitle = ctx.exam.title || translate('sharing.untitledExam');
  const expiresAt = new Date(Date.now() + request.expiryDays * 86_400_000);
  const delivery = createDelivery(request.channel, { examTitle, expiresAt, artemis: request.artemis, language: request.language });
  // A channel that hands the link to a third party carries only factors with a second secret (docs/dev/result_sharing.md).
  if (!channel || (!delivery.sendsPdf && !channel.factors.includes(request.factor))) throw new Error(translate('sharing.errors.factorChannel'));

  const chosen = results.students.filter((_, i) => request.studentKeys.has(keys[i]));
  const blocked = incompatibleStudents(delivery.sendsPdf ? null : request.factor, channel, chosen);
  const warnings = blocked.map(({ student, reason }) => `${displayName(student)}: ${translate(reason)}`);
  const blockedSet = new Set(blocked.map((b) => b.student));
  const bySubmission = new Map<string, number>();
  results.rows.forEach((row, i) => {
    if (row.submissionId && request.studentKeys.has(keys[i]) && !blockedSet.has(results.students[i])) bySubmission.set(row.submissionId, i);
  });
  for (const [i, student] of results.students.entries()) {
    if (request.studentKeys.has(keys[i]) && !results.rows[i].submissionId) warnings.push(translate('sharing.errors.noSubmission', { name: displayName(student) }));
  }

  // Before anything is uploaded: a failed compile ends the run with nothing shared.
  let solution: Uint8Array | undefined;
  if (request.includeSolution && !delivery.sendsPdf) {
    progress('solution');
    solution = await compileSolution(ctx, key, warnings);
  }

  // Artemis sends inside the per-student loop, Mebis packs there; slips and e-mail prepare links (e-mail sends at the end).
  let loopPhase: SharePhase = 'preparing';
  if (request.channel === 'artemis') loopPhase = 'sending';
  else if (request.channel === 'mebis') loopPhase = 'packing';
  const entries: SlipEntry[] = [];
  await logExportAction(request.examId, 'SHARE', key);
  warnings.push(
    ...(await forEachGradedPdf(
      results,
      key,
      fallbackSessionKey,
      async (pdf, row) => {
        const index = row?.submissionId ? bySubmission.get(row.submissionId) : undefined;
        if (index === undefined) return;
        const student = results.students[index];
        const name = displayName(student);
        const filename = `${slug(examTitle)}_${slug(name)}.pdf`;
        if (delivery.sendsPdf) {
          await delivery.deliverPdf(student, name, filename, pdf);
          entries.push({ name, url: '' });
          return;
        }
        const code = await shareCode(request.factor, stickerRawOf(student));
        const link = newShareLink();
        const sealed = await sealShare(link, request.factor, code, { filename, examTitle }, { graded: pdf, solution });
        await createResultShare(request.examId, {
          id: link.shareId,
          studentKey: keys[index],
          lookupHash: await lookupHash(await lookupSecret(link)),
          factor: request.factor,
          expiryDays: request.expiryDays,
          sealed,
        });
        const url = shareUrl(location.origin, link);
        await delivery.deliverLink(student, name, url, request.includeCode ? code : null);
        entries.push({ name, url, ...(request.factor === 'code' && code ? { code } : {}) });
      },
      { only: new Set(bySubmission.keys()), progress: (done, total) => progress(loopPhase, done, total) }
    ))
  );
  progress(loopPhase, bySubmission.size, bySubmission.size);

  const undelivered = await delivery.finish((done, total) => progress('sending', done, total));
  warnings.push(...undelivered);
  entries.sort((a, b) => a.name.localeCompare(b.name));
  // Slips carry the links; on other channels only the codes, which must reach students apart from the link.
  const printed = request.channel === 'slips' || (request.factor === 'code' && !delivery.sendsPdf);
  const slips = printed && entries.length ? await renderShareSlips({ examTitle, expiresAt, factor: request.factor, entries, codesOnly: request.channel !== 'slips' }) : null;
  return {
    shared: entries.length - undelivered.length,
    channel: request.channel,
    warnings,
    download: slips
      ? { bytes: slips, type: 'application/pdf', fileName: `${slug(examTitle)}_${request.channel === 'slips' ? 'links' : 'codes'}_${exportDateStamp()}.pdf` }
      : (delivery.download?.() ?? null),
  };
}
