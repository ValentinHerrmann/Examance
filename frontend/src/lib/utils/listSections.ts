/** Sections of the overview lists (issue #252): favorites, school years (exams only) and the archive. Input order is kept inside every section. */
import type { ExamRecord } from '#lib/db/schema';
import { parseDatumAndDauer } from '#lib/utils/examLabel';

export type SectionKind = 'favorites' | 'unclear' | 'year' | 'all' | 'archive';

export interface ListSection<T> {
  /** Stable key for the remembered open state, e.g. `year:2026`. */
  key: string;
  kind: SectionKind;
  /** First calendar year of the school year (`year` sections only). */
  year?: number;
  items: T[];
  defaultOpen: boolean;
}

/** First calendar year of the school year (August to July) that `date` falls in. */
export function schoolYearOf(date: Date): number {
  return date.getMonth() >= 7 ? date.getFullYear() : date.getFullYear() - 1;
}

/** "2026/27" for the school year starting in 2026. */
export function schoolYearLabel(year: number): string {
  return `${year}/${String((year + 1) % 100).padStart(2, '0')}`;
}

// Unanchored: the date part may carry a weekday or a lesson ("Di, 24.09.2026", "24.09.2026, 2. Stunde").
const DE_DATE = /(?<!\d)(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4}|\d{2})(?!\d)/;
const ISO_DATE = /(?<!\d)(\d{4})-(\d{2})-(\d{2})(?!\d)/;

/** The day an exam is written, from its "date (duration)" field (`formatDatumAndDauer`); null without a full date (no year, free text, empty). */
export function parseExamDatum(value: string | undefined): Date | null {
  const text = parseDatumAndDauer(value).datumDate;
  const de = DE_DATE.exec(text);
  const iso = de ? null : ISO_DATE.exec(text);
  let y: number, m: number, d: number;
  if (de) {
    d = Number(de[1]);
    m = Number(de[2]);
    y = Number(de[3]);
    if (y < 100) y += 2000;
  } else if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else {
    return null;
  }
  const date = new Date(y, m - 1, d);
  return date.getMonth() === m - 1 && date.getDate() === d ? date : null;
}

/** The exam has no full date, so it cannot be filed in a school year; the list and the date field ask for one. */
export function examDateUnclear(exam: Pick<ExamRecord, 'datum'>): boolean {
  return parseExamDatum(exam.datum) === null;
}

/** Favorites (also listed in their year), exams without a full date, one section per school year of the written date (newest first; the current and later ones open), archive (closed). */
export function sectionExams(exams: ExamRecord[], now: Date = new Date()): ListSection<ExamRecord>[] {
  const current = schoolYearOf(now);
  const live = exams.filter((e) => !e.archivedAt);
  const unclear: ExamRecord[] = [];
  const byYear = new Map<number, ExamRecord[]>();
  for (const exam of live) {
    const date = parseExamDatum(exam.datum);
    if (!date) {
      unclear.push(exam);
      continue;
    }
    const year = schoolYearOf(date);
    byYear.set(year, [...(byYear.get(year) ?? []), exam]);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);
  return nonEmpty([
    { key: 'favorites', kind: 'favorites', items: live.filter((e) => e.isFavorite), defaultOpen: true },
    { key: 'unclear', kind: 'unclear', items: unclear, defaultOpen: true },
    ...years.map((year): ListSection<ExamRecord> => ({
      key: `year:${year}`, kind: 'year', year, items: byYear.get(year)!, defaultOpen: year >= current,
    })),
    { key: 'archive', kind: 'archive', items: exams.filter((e) => e.archivedAt), defaultOpen: false },
  ]);
}

/** Library sections: favorites (also listed under all), all, archive (closed). */
export function sectionByFlags<T>(
  items: T[],
  flags: (item: T) => { favorite: boolean; archived: boolean },
): ListSection<T>[] {
  const live = items.filter((i) => !flags(i).archived);
  return nonEmpty([
    { key: 'favorites', kind: 'favorites', items: live.filter((i) => flags(i).favorite), defaultOpen: true },
    { key: 'all', kind: 'all', items: live, defaultOpen: true },
    { key: 'archive', kind: 'archive', items: items.filter((i) => flags(i).archived), defaultOpen: false },
  ]);
}

function nonEmpty<T>(sections: ListSection<T>[]): ListSection<T>[] {
  return sections.filter((s) => s.items.length > 0);
}
