/**
 * RFC 4180 CSV Serializer with UTF-8 BOM for Excel compatibility.
 */

import { logExportAction } from '$lib/gdpr/exportAudit';

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

/** RFC 4180 quoting: wrap in quotes, double any quote inside. */
function csvCell(value: number | string): string {
  const text = typeof value === 'number' ? String(value) : value;
  return `"${text.replace(/"/g, '""')}"`;
}

/**
 * Serialize student grade records to RFC 4180 CSV format and trigger browser file download.
 */
export async function exportGradesToCsv(
  examId: string,
  examTitle: string,
  rows: CsvExportRow[],
  key: CryptoKey | null
): Promise<void> {
  // 1. Audit log export action
  await logExportAction(examId, 'CSV', key);

  // 2. Build RFC 4180 CSV string.
  //
  // The old export carried pseudonym, fallback code and total score only — no
  // max points, no percentage and no grade, i.e. none of what the file is for.
  // Header stays English: it is a machine-readable interchange format, and
  // German spreadsheets import it either way.
  let csvContent =
    'Pseudonym ID,Fallback Code,Student Name,Total Score,Max Points,Percentage,Grade,Status\r\n';

  rows.forEach((row) => {
    csvContent +=
      [
        csvCell(row.studentPseudonymId),
        csvCell(row.fallbackCode),
        csvCell(row.studentName),
        csvCell(row.totalScore),
        csvCell(row.maxPoints),
        csvCell(row.percentage),
        csvCell(row.grade),
        csvCell(row.status),
      ].join(',') + '\r\n';
  });

  // UTF-8 BOM (\uFEFF) ensures Excel opens non-ASCII characters cleanly
  const bom = new Uint8Array([0xef, 0xbb, 0xbf]);
  const textBytes = new TextEncoder().encode(csvContent);
  const blob = new Blob([bom, textBytes], { type: 'text/csv;charset=utf-8;' });

  // Trigger browser download
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  const safeFilename = examTitle.replace(/[^a-z0-9_-]/gi, '_');
  link.download = `${safeFilename}_grades.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
