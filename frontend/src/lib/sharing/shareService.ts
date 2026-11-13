/** Sharing graded PDFs with students (issue #207, docs/dev/result_sharing.md): render in the browser, seal per student, upload ciphertext only, print the slips. Results come through the repositories, so it works in both storage modes. */

import { get } from 'svelte/store';
import type { GradingState } from '#lib/analytics/examResults';
import { createResultShare, listResultDeliveries, listResultShares, openResultShare, updateResultShareContent, type ResultDeliveryInfo, type ResultShareInfo } from '#lib/api/resultShares';
import { joinKeys } from '#lib/crypto/pseudonymKey';
import { personalKey } from '#lib/crypto/stickerKey';
import type { StudentRecord } from '#lib/db/schema';
import { forEachGradedPdf, loadResults } from '#lib/export/examExport';
import { shareReviewOptions, type ReviewPrintOptions } from '#lib/export/reviewPrint';
import { loadReviewPrint } from '#lib/export/reviewPrintPrefs';
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
import { buildReviewItems } from './reviewItems';
import { lookupHash, lookupSecret, newShareLink, openWithKey, resealShare, sealShare, shareUrl, unwrapShareKey, wrapShareKey, type ReviewItem, type ShareFactor, type ShareHeader, type ShareLink } from './shareCrypto';
import { renderShareSlips, type SlipEntry } from './slipsPdf';

export interface ShareStudent {
  student: StudentRecord;
  /** `joinKey` of the student: what a share is stored under. */
  key: string;
  name: string;
  state: GradingState;
  hasSubmission: boolean;
  /** The graded submission, for the link from an objection to the grading page. */
  submissionId?: string;
  share?: ResultShareInfo;
  /** The latest e-mail or Artemis delivery status (issue #221). */
  delivery?: ResultDeliveryInfo;
}

export interface ShareOverview {
  examTitle: string;
  students: ShareStudent[];
  /** Live shares whose student is no longer in the exam. */
  orphans: ResultShareInfo[];
  /** Every delivery status of the exam, for the bounce window. */
  deliveries: ResultDeliveryInfo[];
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
  /** Objections accepted until then (issue #226); null = off. Never after the link expires. */
  reviewUntil: Date | null;
  /** What of the review the student's PDF prints (the `share` scope's remembered choice); never an attachment. */
  reviewPrint: ReviewPrintOptions;
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

/** The newest status per student across channels (the list is ordered by update time). */
export function latestDeliveries(deliveries: readonly ResultDeliveryInfo[]): Map<string, ResultDeliveryInfo> {
  return new Map(deliveries.map((d) => [d.studentKey, d]));
}

/** Statuses that need the teacher: the message did not reach the student. */
export const undelivered = (d: ResultDeliveryInfo | undefined): boolean => d?.status === 'bounced' || d?.status === 'failed';

/** Students with their grading state, live share and delivery status, for the dialog. */
export async function loadShareOverview(examId: string): Promise<ShareOverview> {
  const { key } = await sessionKeys();
  const ctx = await loadExam(examId, key);
  const [results, shares, deliveries] = await Promise.all([loadResults({ ...ctx, key }), listResultShares(examId), listResultDeliveries(examId)]);
  const keys = await joinKeys(results.students);
  const shareByKey = new Map(shares.map((s) => [s.studentKey, s]));
  const deliveryByKey = latestDeliveries(deliveries);
  const students = results.students.map((student, i) => ({
    student,
    key: keys[i],
    name: displayName(student),
    state: results.rows[i].state,
    hasSubmission: Boolean(results.rows[i].submissionId),
    submissionId: results.rows[i].submissionId ?? undefined,
    share: shareByKey.get(keys[i]),
    delivery: deliveryByKey.get(keys[i]),
  }));
  const known = new Set(keys);
  return {
    examTitle: ctx.exam.title ?? '',
    students,
    orphans: shares.filter((s) => !known.has(s.studentKey)),
    deliveries,
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

/** Selected students without a graded submission: nothing to share for them. */
function noSubmissionWarnings(
  students: StudentRecord[],
  rows: { submissionId?: string | null }[],
  keys: string[],
  chosen: ReadonlySet<string>
): string[] {
  return students
    .filter((_, i) => chosen.has(keys[i]) && !rows[i].submissionId)
    .map((student) => translate('sharing.errors.noSubmission', { name: displayName(student) }));
}

/** Artemis sends inside the per-student loop, Mebis packs there; slips and e-mail prepare links (e-mail sends at the end). */
function loopPhaseFor(channel: ShareChannelId): SharePhase {
  if (channel === 'artemis') return 'sending';
  if (channel === 'mebis') return 'packing';
  return 'preparing';
}

export async function shareResults(request: ShareRequest, progress: ShareProgress): Promise<ShareOutcome> {
  const { key, fallbackSessionKey } = await sessionKeys();
  const ctx = await loadExam(request.examId, key);
  const results = await loadResults({ ...ctx, key });
  const keys = await joinKeys(results.students);
  const channel = SHARE_CHANNELS.find((c) => c.id === request.channel);
  const examTitle = ctx.exam.title || translate('sharing.untitledExam');
  const expiresAt = new Date(Date.now() + request.expiryDays * 86_400_000);
  const delivery = createDelivery(request.channel, { examId: request.examId, examTitle, expiresAt, artemis: request.artemis, language: request.language });
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
  warnings.push(...noSubmissionWarnings(results.students, results.rows, keys, request.studentKeys));

  // Before anything is uploaded: a failed compile ends the run with nothing shared.
  let solution: Uint8Array | undefined;
  if (request.includeSolution && !delivery.sendsPdf) {
    progress('solution');
    solution = await compileSolution(ctx, key, warnings);
  }

  const reviewUntil = request.reviewUntil && !delivery.sendsPdf ? new Date(Math.min(request.reviewUntil.getTime(), expiresAt.getTime())) : null;
  const scoresBySubmission = new Map<string, typeof results.scoreRecords>();
  for (const sc of results.scoreRecords) scoresBySubmission.set(sc.submissionId, [...(scoresBySubmission.get(sc.submissionId) ?? []), sc]);
  const loopPhase = loopPhaseFor(request.channel);
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
          await delivery.deliverPdf(student, keys[index], name, filename, pdf);
          entries.push({ name, url: '' });
          return;
        }
        const code = await shareCode(request.factor, stickerRawOf(student));
        const link = newShareLink();
        const header: ShareHeader = { filename, examTitle };
        if (reviewUntil) header.items = buildReviewItems(ctx.exercises, ctx.mcGroups, scoresBySubmission.get(row?.submissionId ?? '') ?? []);
        const sealed = await sealShare(link, request.factor, code, header, { graded: pdf, solution });
        await createResultShare(request.examId, {
          id: link.shareId,
          studentKey: keys[index],
          lookupHash: await lookupHash(await lookupSecret(link)),
          factor: request.factor,
          expiryDays: request.expiryDays,
          sealed,
          wrappedKey: await wrapShareKey(link, sealed.contentKey),
          reviewUntil,
        });
        const url = shareUrl(location.origin, link);
        await delivery.deliverLink(student, keys[index], name, url, request.includeCode ? code : null);
        entries.push({ name, url, ...(request.factor === 'code' && code ? { code } : {}) });
      },
      { only: new Set(bySubmission.keys()), progress: (done, total) => progress(loopPhase, done, total), reviewPrint: shareReviewOptions(request.reviewPrint) }
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

/** What a republish did: the link (for the reply mail), the student's record, and the items as they were published before and are now. */
export interface Republished {
  link: ShareLink;
  contentKey: Uint8Array;
  student: StudentRecord;
  examTitle: string;
  before: ReviewItem[];
  after: ReviewItem[];
}

/** Re-renders one student's graded PDF with the current scores and the review notes and re-seals it under the same link (issue #226). The sample solution of the original is carried over; *beforeRender* runs once the old and new items are known, before the PDF is drawn (the reply flow saves its record there so the PDF prints it). */
export async function republishShare(
  examId: string,
  share: ResultShareInfo,
  options: { beforeRender?: (change: { before: ReviewItem[]; after: ReviewItem[] }) => Promise<void> } = {}
): Promise<Republished> {
  if (!share.updatable || !share.wrappedKey) throw new Error(translate('review.errors.notUpdatable'));
  const { key, fallbackSessionKey } = await sessionKeys();
  const ctx = await loadExam(examId, key);
  const results = await loadResults({ ...ctx, key });
  const keys = await joinKeys(results.students);
  const index = keys.indexOf(share.studentKey);
  const submissionId = results.rows[index]?.submissionId;
  if (index < 0 || !submissionId) throw new Error(translate('review.errors.noSubmission'));

  const { link, contentKey } = await unwrapShareKey(share.id, share.wrappedKey);
  const current = await openResultShare(share.id, await lookupSecret(link));
  const opened = await openWithKey(share.id, contentKey, current.sealed);
  const before = opened.header.items ?? [];
  const after = share.reviewUntil ? buildReviewItems(ctx.exercises, ctx.mcGroups, results.scoreRecords.filter((sc) => sc.submissionId === submissionId)) : [];
  await options.beforeRender?.({ before, after });

  let graded: Uint8Array | undefined;
  const onPdf = (pdf: Uint8Array) => {
    graded = pdf;
  };
  const warnings = await forEachGradedPdf(results, key, fallbackSessionKey, onPdf, { only: new Set([submissionId]), reviewPrint: shareReviewOptions(loadReviewPrint('share')) });
  if (!graded) throw new Error(warnings[0] ?? translate('review.errors.noSubmission'));
  const { items: _old, ...rest } = opened.header;
  const header: ShareHeader = share.reviewUntil ? { ...rest, items: after } : rest;
  await updateResultShareContent(examId, share.id, await resealShare(share.id, contentKey, header, { graded, solution: opened.documents.solution }));
  return { link, contentKey, student: results.students[index], examTitle: ctx.exam.title ?? '', before, after };
}
