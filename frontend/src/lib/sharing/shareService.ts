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
import { loadExamCompileContext } from '#lib/grading/omrTemplatePrep';
import { translate } from '#lib/i18n';
import { awaitSessionReady, sessionStore } from '#lib/stores/session';
import { randomCode } from '#lib/utils/randomCode';
import { formatStudentName, stickerRawOf } from '#lib/utils/studentQr';
import { incompatibleStudents, SHARE_CHANNELS, type ShareChannelId } from './channels';
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
}

export interface ShareRequest {
  examId: string;
  channel: ShareChannelId;
  factor: ShareFactor;
  expiryDays: number;
  /** `ShareStudent.key` of every student to share with. */
  studentKeys: ReadonlySet<string>;
}

export interface ShareOutcome {
  shared: number;
  warnings: string[];
  slips: Uint8Array | null;
  fileName: string;
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

/** Students with their grading state and live share, for the dialog. */
export async function loadShareOverview(examId: string): Promise<ShareOverview> {
  const { key } = await sessionKeys();
  const ctx = await loadExam(examId, key);
  const [results, shares] = await Promise.all([loadResults({ ...ctx, key }, false), listResultShares(examId)]);
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
  return { examTitle: ctx.exam.title ?? '', students, orphans: shares.filter((s) => !known.has(s.studentKey)) };
}

/** Shares the chosen students' graded PDFs and returns the slips to print. A student who cannot be served, or whose PDF fails, becomes a warning. */
export async function shareResults(
  request: ShareRequest,
  progress: (done: number, total: number) => void
): Promise<ShareOutcome> {
  const { key, fallbackSessionKey } = await sessionKeys();
  const ctx = await loadExam(request.examId, key);
  const results = await loadResults({ ...ctx, key }, true);
  const keys = await joinKeys(results.students);
  const channel = SHARE_CHANNELS.find((c) => c.id === request.channel);
  if (!channel?.factors.includes(request.factor)) throw new Error(translate('sharing.errors.factorChannel'));

  const chosen = results.students.filter((_, i) => request.studentKeys.has(keys[i]));
  const blocked = incompatibleStudents(request.factor, channel, chosen);
  const warnings = blocked.map(({ student, reason }) => `${displayName(student)}: ${translate(reason)}`);
  const blockedSet = new Set(blocked.map((b) => b.student));
  const bySubmission = new Map<string, number>();
  results.rows.forEach((row, i) => {
    if (row.submissionId && request.studentKeys.has(keys[i]) && !blockedSet.has(results.students[i])) bySubmission.set(row.submissionId, i);
  });
  for (const [i, student] of results.students.entries()) {
    if (request.studentKeys.has(keys[i]) && !results.rows[i].submissionId) warnings.push(translate('sharing.errors.noSubmission', { name: displayName(student) }));
  }

  const examTitle = ctx.exam.title || translate('sharing.untitledExam');
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
        const raw = stickerRawOf(student);
        const code = request.factor === 'code' ? randomCode(8) : request.factor === 'sticker' && raw ? await personalKey(raw) : null;
        const link = newShareLink();
        const sealed = await sealShare(link, request.factor, code, { filename: `${slug(examTitle)}_${slug(name)}.pdf`, examTitle }, pdf);
        await createResultShare(request.examId, {
          id: link.shareId,
          studentKey: keys[index],
          lookupHash: await lookupHash(await lookupSecret(link)),
          factor: request.factor,
          expiryDays: request.expiryDays,
          sealed,
        });
        entries.push({ name, url: shareUrl(location.origin, link), ...(request.factor === 'code' && code ? { code } : {}) });
      },
      { only: new Set(bySubmission.keys()), progress }
    ))
  );

  const expiresAt = new Date(Date.now() + request.expiryDays * 86_400_000);
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return {
    shared: entries.length,
    warnings,
    slips: entries.length ? await renderShareSlips({ examTitle, expiresAt, factor: request.factor, entries }) : null,
    fileName: `${slug(examTitle)}_links_${exportDateStamp()}.pdf`,
  };
}
