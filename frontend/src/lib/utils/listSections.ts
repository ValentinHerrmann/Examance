/** Sections of the overview lists (issue #252): favorites, school years (exams only) and the archive. Input order is kept inside every section. */
import type { ExamRecord } from '#lib/db/schema';

export type SectionKind = 'favorites' | 'year' | 'all' | 'archive';

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

const DE_DATE = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{2}|\d{4})$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/** The free-text exam date as a date, when it is one (German `dd.mm.yyyy`/`dd.mm.yy` or ISO); else null. */
export function parseExamDatum(value: string | undefined): Date | null {
  const text = value?.trim() ?? '';
  let y: number, m: number, d: number;
  const de = DE_DATE.exec(text);
  const iso = de ? null : ISO_DATE.exec(text);
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

/** The date an exam is filed under: its printed date when it parses, else when it was created. */
export function examDateOf(exam: Pick<ExamRecord, 'datum' | 'createdAt'>): Date {
  return parseExamDatum(exam.datum) ?? new Date(exam.createdAt);
}

/** Favorites (also listed in their year), one section per school year (newest first; the current and later ones open), archive (closed). */
export function sectionExams(exams: ExamRecord[], now: Date = new Date()): ListSection<ExamRecord>[] {
  const current = schoolYearOf(now);
  const live = exams.filter((e) => !e.archivedAt);
  const byYear = new Map<number, ExamRecord[]>();
  for (const exam of live) {
    const date = examDateOf(exam);
    const year = Number.isNaN(date.getTime()) ? current : schoolYearOf(date);
    byYear.set(year, [...(byYear.get(year) ?? []), exam]);
  }
  const years = [...byYear.keys()].sort((a, b) => b - a);
  return nonEmpty([
    { key: 'favorites', kind: 'favorites', items: live.filter((e) => e.isFavorite), defaultOpen: true },
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
