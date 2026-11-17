/** Delete and split of stored scans (scan page, issue #292); every write goes through the repositories, so both storage modes behave alike. */
import { openScan, sealScan } from '#lib/db/dbEncryption';
import type { ExerciseScoreRecord, PseudonymVersion } from '#lib/db/schema';
import { joinKey } from '#lib/crypto/pseudonymKey';
import { scoreRepository } from '#lib/repositories/scoreRepository';
import { studentRepository } from '#lib/repositories/studentRepository';
import { submissionRepository } from '#lib/repositories/submissionRepository';
import { pseudonymFor } from '#lib/services/pseudonymRekey';
import { randomCode } from '#lib/utils/randomCode';
import { carryAttachments } from '#lib/scan/scanPdf';
import { newTrashGroup } from '#lib/trash/group';
import type { TranslationKey } from '#lib/i18n/types';

export interface ScanRef {
  id: string;
  pseudonymHmac: string;
  pseudonymVersion?: PseudonymVersion;
  createdAt: string;
  /** The student came from the Students page: deleting the scan keeps them. */
  fromList?: boolean;
}

/** A split the page must explain instead of attempting: `key` is an i18n key, `params` its values. */
export class SplitRefused extends Error {
  constructor(
    readonly key: TranslationKey,
    readonly params: Record<string, string | number> = {},
  ) {
    super(key);
  }
}

/** Deletes scans and the students only they used; a student still linked to another submission of the exam keeps their record (two scans of one student share it). */
export async function deleteScans(examId: string, items: readonly ScanRef[], opts: { group: string; key: CryptoKey | null }): Promise<void> {
  // Read before any delete: a failed read must stop here, never delete a student still in use.
  const uses = new Map<string, number>();
  for (const sub of await submissionRepository.getByExamId(examId, opts.key)) {
    const k = await joinKey(sub);
    uses.set(k, (uses.get(k) ?? 0) + 1);
  }
  for (const item of items) {
    await submissionRepository.delete(examId, item.id, { group: opts.group }); // NOSONAR: deletes run in order, so a failure leaves a clean prefix
    const k = await joinKey({ ...item, examId });
    const left = (uses.get(k) ?? 1) - 1;
    uses.set(k, left);
    if (!item.fromList && left <= 0) {
      await studentRepository.delete({ examId, pseudonymHmac: item.pseudonymHmac, pseudonymVersion: item.pseudonymVersion }, { group: opts.group });
    }
  }
}

/** An MC row read from a page at or after *firstMoved* (0-based scan page), rebased onto the second part; null when it stays. */
function movedRow(row: ExerciseScoreRecord, firstMoved: number, part2Id: string): ExerciseScoreRecord | null {
  const detections = row.omrMeta?.detections;
  if (!detections || detections.pageIndex < firstMoved) return null;
  return {
    ...row,
    id: crypto.randomUUID(),
    submissionId: part2Id,
    omrMeta: { ...row.omrMeta!, detections: { ...detections, pageIndex: detections.pageIndex - firstMoved } },
  };
}

/** Splits a scan before *splitPage* (1-based) into two submissions. The second part, with the MC rows read from its pages, is stored before the original shrinks, so a failure never loses a page. Refuses a scan with hand grading. */
export async function splitScan(
  examId: string,
  item: ScanRef,
  splitPage: number,
  keys: { key: CryptoKey | null; fallbackKey?: CryptoKey | null },
): Promise<{ firstEnd: number; secondStart: number; totalPages: number }> {
  const activeKey = keys.key ?? keys.fallbackKey ?? null;
  if (!activeKey) throw new SplitRefused('scanning.errorNoSessionKey');
  let stored: Awaited<ReturnType<typeof submissionRepository.getById>>;
  let scores: ExerciseScoreRecord[];
  try {
    stored = await submissionRepository.getById(examId, item.id, activeKey);
    scores = await scoreRepository.getBySubmissionId(examId, item.id, activeKey);
  } catch (err) {
    throw new SplitRefused('scanning.errorLoadScan', { message: err instanceof Error ? err.message : String(err) });
  }
  if (!stored?.scanCt || !stored.scanIv) throw new SplitRefused('scanning.splitNoScan');
  if (stored.annotationCt || stored.hasAnnotations || scores.some((row) => !row.omrMeta)) throw new SplitRefused('scanning.splitGraded');

  const pdfLib = await import('pdf-lib');
  const srcPdf = await pdfLib.PDFDocument.load(await openScan(item.id, stored.scanCt, stored.scanIv, activeKey, keys.fallbackKey ?? null), { ignoreEncryption: true });
  const totalPages = srcPdf.getPageCount();
  if (splitPage > totalPages) throw new SplitRefused('scanning.splitExceedsPages', { splitPage, totalPages });

  const firstMoved = splitPage - 1;
  const partOf = async (indices: number[]) => {
    const out = await pdfLib.PDFDocument.create();
    for (const page of await out.copyPages(srcPdf, indices)) out.addPage(page);
    // Both parts keep the attached original A3 scan (issue #220): it is never dropped.
    await carryAttachments(pdfLib, srcPdf, out);
    return out.save();
  };
  const buf1 = await partOf(Array.from({ length: firstMoved }, (_, i) => i));
  const buf2 = await partOf(Array.from({ length: totalPages - firstMoved }, (_, i) => i + firstMoved));

  // Ids first: each part's ciphertext is bound to its submission (AAD, issue #178).
  const part2Id = crypto.randomUUID();
  const part1 = await sealScan(item.id, buf1, activeKey);
  const part2 = await sealScan(part2Id, buf2, activeKey);

  // 1. The second part as a new unmatched student, its submission and its MC rows; never queued, so a failure stops before the original shrinks.
  const pseudonym = await pseudonymFor(examId, crypto.randomUUID());
  await studentRepository.save(
    { ...pseudonym, examId, fallbackCode: `UNMATCHED-${randomCode()}`, piiCt: new Uint8Array([0]), piiIv: new Uint8Array(12) },
    activeKey,
  );
  await submissionRepository.save(
    {
      id: part2Id,
      examId,
      pseudonymHmac: pseudonym.pseudonymHmac,
      pseudonymVersion: pseudonym.pseudonymVersion,
      scanCt: part2.ct,
      scanIv: part2.iv,
      createdAt: new Date().toISOString(),
    },
    activeKey,
    { noQueue: true },
  );
  const moves = scores.flatMap((row) => {
    const moved = movedRow(row, firstMoved, part2Id);
    return moved ? [{ from: row, moved }] : [];
  });
  await scoreRepository.saveMany(examId, part2Id, moves.map((m) => m.moved), activeKey, { noQueue: true });

  // 2. Only now the original shrinks; the repository keeps everything this record leaves out, but a total counted with moved rows is stale.
  await submissionRepository.save(
    { ...stored, scanCt: part1.ct, scanIv: part1.iv, totalScore: moves.length ? undefined : stored.totalScore },
    activeKey,
    { clearTotal: moves.length > 0 },
  );
  // 3. The moved rows leave the first part, as one trash entry.
  const group = newTrashGroup();
  await Promise.all(moves.map(({ from }) => scoreRepository.deleteOne(examId, item.id, from.exerciseId, { group })));

  return { firstEnd: firstMoved, secondStart: splitPage, totalPages };
}
