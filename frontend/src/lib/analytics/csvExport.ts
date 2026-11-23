/**
 * RFC 4180 CSV Serializer with UTF-8 BOM for Excel compatibility.
 */

import { logExportAction } from '#lib/gdpr/exportAudit';
import { downloadBlob } from '#lib/utils/download';
import { examFileName, FILE_KIND, type ExamFileFields } from '#lib/export/fileName';

export interface CsvExportRow {
  studentPseudonymId: string;
  fallbackCode: string;
  studentName: string;
  totalScore: number | string;
  maxPoints: number | string;
  percentage: number | string;
  grade: string;
  /** Empty unless the submission is only partly corrected. */
  status: string;
}

// Text starting with these is run as a formula by Excel and LibreOffice (CSV injection); numbers are written as numbers.
const FORMULA_START = /^[=+\-@\t\r]/;

/** RFC 4180 quoting: wrap in quotes, double any quote inside; text that could start a formula gets a leading apostrophe. */
function csvCell(value: number | string): string {
  const text = typeof value === 'number' ? String(value) : value.replace(FORMULA_START, "'$&");
  return `"${text.replaceAll('"', '""')}"`;
}

/** RFC 4180 CSV bytes with a UTF-8 BOM (Excel). The header stays English: it is a machine-readable interchange format, and German spreadsheets import it either way. */
export function buildGradesCsv(rows: CsvExportRow[]): Uint8Array {
  const lines = [
    'Pseudonym ID,Fallback Code,Student Name,Total Score,Max Points,Percentage,Grade,Status',
    ...rows.map((row) =>
      [
        row.studentPseudonymId,
        row.fallbackCode,
        row.studentName,
        row.totalScore,
        row.maxPoints,
        row.percentage,
        row.grade,
        row.status,
      ]
        .map(csvCell)
        .join(',')
    ),
  ];
  const text = new TextEncoder().encode(lines.join('\r\n') + '\r\n');
  const bytes = new Uint8Array(3 + text.length);
  bytes.set([0xef, 0xbb, 0xbf]);
  bytes.set(text, 3);
  return bytes;
}

/** Audit-logs the export, then downloads the grades as CSV. */
export async function exportGradesToCsv(
  examId: string,
  exam: ExamFileFields,
  rows: CsvExportRow[],
  key: CryptoKey | null
): Promise<void> {
  await logExportAction(examId, 'CSV', key);
  const blob = new Blob([buildGradesCsv(rows) as BlobPart], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, examFileName(exam, [FILE_KIND.grades], 'csv'));
}
