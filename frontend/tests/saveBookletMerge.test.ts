import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as pdfLib from 'pdf-lib';

import { db } from '../src/lib/db/db';
import { openScan, sealScan } from '../src/lib/db/dbEncryption';
import { submissionRepository } from '../src/lib/repositories/submissionRepository';
import { saveBooklet } from '../src/lib/scan/ingest';
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
    await Promise.all([db.submissions.clear(), db.examStudents.clear()]);
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
