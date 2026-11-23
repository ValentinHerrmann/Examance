/** Names of downloaded exam files (issue #337): `<yyyy-mm-dd>_<Fach>_<Kurs>_<Testart>_<Nr>[_<parts>].<ext>`. The only exam file-name builder. */
import { slug } from '#lib/export/zip';
import { examCourse } from '#lib/utils/examLabel';
import { parseExamDatum } from '#lib/utils/listSections';

/** The exam fields a file name is built from. */
export type ExamFileFields = {
  datum?: string | null;
  fach?: string | null;
  grade?: string | null;
  klasse?: string | null;
  course?: string | null;
  testart?: string | null;
  nr?: string | null;
  title?: string | null;
};

/** Fixed German file-kind suffixes; never translated, so names stay the same for every teacher. */
export const FILE_KIND = {
  exam: 'Angabe',
  solution: 'Loesung',
  booklet: 'Heft',
  extraSheet: 'Zusatzblatt',
  qr: 'QR',
  keys: 'Schluessel',
  copies: 'Kopien',
  copiesA3: 'Kopien_A3',
  booklets: 'Hefte',
  grades: 'Noten',
  summary: 'Statistik',
  examtimer: 'Examtimer',
  latex: 'LaTeX',
  gradedAll: 'Gesamt_korrigiert',
  graded: 'korrigiert',
  partial: 'teilweise',
  ungraded: 'unkorrigiert',
  mebis: 'Mebis_Feedback',
  links: 'Links',
  codes: 'Codes',
  scan: 'Scan',
  sheet: 'Bogen',
} as const;

/** Placeholder when the exam has no full date, so undated exams sort first and read as undated. */
export const UNDATED = '0000-00-00';

function isoDay(date: Date): string {
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${mm}-${dd}`;
}

/** `2026-11-05_Informatik_10a_Kurzarbeit_1`; the slugged title (else `exam`) when subject, course, type and number are all empty. */
export function examFileBase(exam: ExamFileFields): string {
  const date = parseExamDatum(exam.datum ?? undefined);
  const meta = [exam.fach, examCourse(exam), exam.testart, exam.nr].map((p) => slug(p ?? '', '')).filter(Boolean);
  return [date ? isoDay(date) : UNDATED, ...(meta.length ? meta : [slug(exam.title ?? '', 'exam')])].join('_');
}

/** `examFileBase` plus the slugged non-empty `parts` (student, file kind) and the extension (without dot; empty for a folder name). */
export function examFileName(exam: ExamFileFields, parts: (string | null | undefined)[], ext = ''): string {
  const name = [examFileBase(exam), ...parts.map((p) => slug(p ?? '', ''))].filter(Boolean).join('_');
  return ext ? `${name}.${ext}` : name;
}
