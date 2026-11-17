import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as pdfLib from 'pdf-lib';

import { db } from '../src/lib/db/db';
import { openScan, sealScan } from '../src/lib/db/dbEncryption';
import { submissionRepository } from '../src/lib/repositories/submissionRepository';
import { scoreRepository } from '../src/lib/repositories/scoreRepository';
import type { ExerciseScoreRecord } from '../src/lib/db/schema';
import { keepCheckedRows, saveBooklet, type IngestWarning, type PdfPageRef } from '../src/lib/scan/ingest';
import { addPlaceholderPage, placeholderOf } from '../src/lib/scan/scanPdf';
import { sessionStore } from '../src/lib/stores/session';
import { storagePolicyStore } from '../src/lib/stores/storagePolicy';
import type { OmrRunInfo } from '../src/lib/grading/omrSettings';
import { hkdfMasterKey } from './helpers/keys';

vi.mock('../src/lib/api/client', () => ({
  api: { get: vi.fn(), put: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

// The keyed pseudonym is covered in tests/crypto.test.ts; here it only has to match the stored submission.
vi.mock('../src/lib/services/pseudonymRekey', () => ({
  pseudonymFor: vi.fn(async (_examId: string, raw: string) => ({ pseudonymHmac: `keyed:${raw}`, pseudonymVersion: 2, pseudonymRaw: raw })),
}));

const EXAM = 'exam-1';

describe('saveBooklet joining a graded hybrid submission (issue #282)', () => {
  let key: CryptoKey;

  beforeEach(async () => {
    await Promise.all([db.submissions.clear(), db.examStudents.clear(), db.exerciseScores.clear()]);
    storagePolicyStore.setPolicy({ storageMode: 'hybrid', latexCompilation: 'local' });
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await sessionStore.unlock({ masterKey: await hkdfMasterKey(), sessionKey: key, sessionNonce: new Uint8Array(12) });
  });

  it('keeps the annotations and the total when the missing page arrives', async () => {
    const earlier = await pdfLib.PDFDocument.create();
    earlier.addPage();
    await addPlaceholderPage(pdfLib, earlier, 2);
    const { ct, iv } = await sealScan('sub-1', await earlier.save(), key);
    await submissionRepository.save(
      {
        id: 'sub-1',
        examId: EXAM,
        pseudonymHmac: 'keyed:S1',
        pseudonymVersion: 2,
        scanCt: ct,
        scanIv: iv,
        annotationCt: new Uint8Array(16).fill(7),
        annotationIv: new Uint8Array(12).fill(7),
        totalScore: 12,
        createdAt: '2026-11-01T00:00:00Z',
      },
      key,
    );

    const later = await pdfLib.PDFDocument.create();
    later.addPage();
    const booklet = { pseudonymId: 'S1', fallbackCode: 'S1', isUnmatched: false, pageRefs: [{ doc: later, index: 0, page: 2 }] };
    const run = { runId: 'r', detectedAt: '2026-11-02T00:00:00Z', trigger: 'scan', algorithmVersion: 4 } as unknown as OmrRunInfo;
    await saveBooklet(booklet, { examId: EXAM, getSessionKey: () => key }, run, [], new Map(), {
      templatePages: 2,
      submissions: await submissionRepository.getByExamId(EXAM, key),
      pageCodes: true,
    });

    const row = await submissionRepository.getById(EXAM, 'sub-1', key);
    expect(row?.annotationCt).toEqual(new Uint8Array(16).fill(7));
    expect(row?.totalScore).toBe(12);
    const pages = (await pdfLib.PDFDocument.load(await openScan('sub-1', row!.scanCt!, row!.scanIv!, key))).getPages();
    expect(pages).toHaveLength(2);
    expect(pages.map((p) => placeholderOf(pdfLib, p))).toEqual([null, null]);
  });
});

describe('saveBooklet never overwrites checked MC answers (issue #283)', () => {
  let key: CryptoKey;
  const run = { runId: 'r', detectedAt: '2026-11-02T00:00:00Z', trigger: 'scan', algorithmVersion: 4 } as unknown as OmrRunInfo;
  const reading = (exerciseId: string, pageRef: PdfPageRef, selected: number) => ({
    result: { exerciseId, pageIndex: (pageRef.page ?? 1) - 1, selectedOptions: [selected], score: 1, confidence: 'high' as const, flaggedOptions: [], bubbles: [] },
    pageStats: {} as never,
    pageRef,
  });
  const scanned = async (pages: number[]) => {
    const doc = await pdfLib.PDFDocument.create();
    for (const _ of pages) doc.addPage();
    return pages.map((page, index) => ({ doc, index, page }));
  };
  const selectedOf = async (subId: string) =>
    Object.fromEntries((await scoreRepository.getBySubmissionId(EXAM, subId, key)).map((r) => [r.exerciseId, r.selectedOptions]));

  beforeEach(async () => {
    await Promise.all([db.submissions.clear(), db.examStudents.clear(), db.exerciseScores.clear()]);
    storagePolicyStore.setPolicy({ storageMode: 'hybrid', latexCompilation: 'local' });
    key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await sessionStore.unlock({ masterKey: await hkdfMasterKey(), sessionKey: key, sessionNonce: new Uint8Array(12) });
  });

  it('a page that came twice keeps its first reading and is pointed out', async () => {
    const [p1, p2, again] = await scanned([1, 2, 1]);
    const booklet = { pseudonymId: 'S1', fallbackCode: 'S1', isUnmatched: false, pageRefs: [p1, p2, again] };
    const warnings: IngestWarning[] = [];
    await saveBooklet(booklet, { examId: EXAM, getSessionKey: () => key }, run, [reading('ex1', p1, 0), reading('ex1', again, 2)], new Map(), { templatePages: 2, warnings, pageCodes: true });

    const [sub] = await submissionRepository.getByExamId(EXAM, key);
    expect(await selectedOf(sub.id)).toEqual({ ex1: [0] });
    expect(warnings).toContainEqual({ kind: 'repeatedPages', student: 'S1', pages: [1] });
    expect((await pdfLib.PDFDocument.load(await openScan(sub.id, sub.scanCt!, sub.scanIv!, key))).getPageCount()).toBe(3);
  });

  it('filling a placeholder reads only the new page and keeps verified and hand-set rows', async () => {
    const earlier = await pdfLib.PDFDocument.create();
    earlier.addPage();
    await addPlaceholderPage(pdfLib, earlier, 2);
    const { ct, iv } = await sealScan('sub-1', await earlier.save(), key);
    await submissionRepository.save({ id: 'sub-1', examId: EXAM, pseudonymHmac: 'keyed:S1', pseudonymVersion: 2, scanCt: ct, scanIv: iv, createdAt: '2026-11-01T00:00:00Z' }, key);
    const omr = (reviewedAt?: string) => ({ confidence: 'high', source: 'omr', ...(reviewedAt ? { reviewedAt } : {}) }) as ExerciseScoreRecord['omrMeta'];
    await scoreRepository.saveMany(
      EXAM,
      'sub-1',
      [
        { id: 'a', submissionId: 'sub-1', exerciseId: 'ex1', score: 1, selectedOptions: [1], omrMeta: omr('2026-11-01T10:00:00Z') },
        { id: 'b', submissionId: 'sub-1', exerciseId: 'exHand', score: 2, selectedOptions: [1] },
        { id: 'c', submissionId: 'sub-1', exerciseId: 'exOld', score: 0, selectedOptions: [], omrMeta: omr() },
      ],
      key,
    );

    const [p1, p2] = await scanned([1, 2]);
    const booklet = { pseudonymId: 'S1', fallbackCode: 'S1', isUnmatched: false, pageRefs: [p1, p2] };
    const warnings: IngestWarning[] = [];
    const readings = [reading('ex1', p1, 3), reading('exHand', p2, 3), reading('exOld', p2, 3), reading('exNew', p2, 3)];
    await saveBooklet(booklet, { examId: EXAM, getSessionKey: () => key }, run, readings, new Map(), {
      templatePages: 2,
      warnings,
      submissions: await submissionRepository.getByExamId(EXAM, key),
      pageCodes: true,
    });

    expect(await selectedOf('sub-1')).toEqual({ ex1: [1], exHand: [1], exOld: [3], exNew: [3] });
    expect(warnings).toContainEqual({ kind: 'repeatedPages', student: 'S1', pages: [1] });
  });

  it('keepCheckedRows drops fresh rows only where the stored row was checked', () => {
    const row = (exerciseId: string, omrMeta?: ExerciseScoreRecord['omrMeta']) => ({ id: exerciseId, submissionId: 's', exerciseId, omrMeta }) as ExerciseScoreRecord;
    const stored = [row('verified', { reviewedAt: 't' } as never), row('hand'), row('detected', {} as never)];
    expect(keepCheckedRows([row('verified'), row('hand'), row('detected'), row('new')], stored).map((r) => r.exerciseId)).toEqual(['detected', 'new']);
  });
});
