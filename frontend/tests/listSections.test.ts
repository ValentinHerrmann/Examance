import { describe, it, expect } from 'vitest';
import type { ExamRecord } from '../src/lib/db/schema';
import { examDateUnclear, parseExamDatum, schoolYearLabel, schoolYearOf, sectionByFlags, sectionExams } from '../src/lib/utils/listSections';

const exam = (id: string, extra: Partial<ExamRecord> = {}): ExamRecord =>
  ({ id, teacherId: 't', title: id, retentionUntil: '2030-01-01', compilationStatus: 'pending', createdAt: '2026-10-01T10:00:00Z', ...extra }) as ExamRecord;

describe('school years', () => {
  it('starts the school year in August', () => {
    expect(schoolYearOf(new Date(2026, 6, 31))).toBe(2025);
    expect(schoolYearOf(new Date(2026, 7, 1))).toBe(2026);
    expect(schoolYearLabel(2026)).toBe('2026/27');
    expect(schoolYearLabel(2099)).toBe('2099/00');
  });

  it('parses German and ISO exam dates and rejects anything else', () => {
    expect(parseExamDatum('12.3.2026')?.getMonth()).toBe(2);
    expect(parseExamDatum('12.03.26')?.getFullYear()).toBe(2026);
    expect(parseExamDatum('2026-09-15')?.getDate()).toBe(15);
    expect(parseExamDatum('31.02.2026')).toBeNull();
    expect(parseExamDatum('nach den Ferien')).toBeNull();
    expect(parseExamDatum(undefined)).toBeNull();
  });

  it('reads the date part of "date (duration)" and dates inside a longer text', () => {
    expect(parseExamDatum('24.09.2026 (30 Minuten)')?.getDate()).toBe(24);
    expect(parseExamDatum('Di, 24.09.2026')?.getMonth()).toBe(8);
    expect(parseExamDatum('24.09.2026, 2. Stunde')?.getFullYear()).toBe(2026);
    expect(parseExamDatum('2026-09-24 (45 Min)')?.getDate()).toBe(24);
  });

  it('counts a date without a year, free text or nothing as unclear', () => {
    expect(examDateUnclear({ datum: '24.09.' })).toBe(true);
    expect(examDateUnclear({ datum: '24.09. (30 Min)' })).toBe(true);
    expect(examDateUnclear({ datum: '' })).toBe(true);
    expect(examDateUnclear({ datum: undefined })).toBe(true);
    expect(examDateUnclear({ datum: '24.09.2026 (30 Min)' })).toBe(false);
  });
});

describe('sectionExams', () => {
  const now = new Date(2026, 10, 11);

  it('files exams by their written date, never by creation, and keeps favorites in their year too', () => {
    const sections = sectionExams(
      [
        exam('a', { datum: '15.03.2026 (45 Minuten)' }),
        exam('b', { isFavorite: true, datum: '24.09.2026 (30 Minuten)', createdAt: '2025-06-01T00:00:00Z' }),
        exam('c', { datum: 'irgendwann', createdAt: '2024-09-01T00:00:00Z' }),
        exam('d', { archivedAt: '2026-11-01T00:00:00Z', isFavorite: true }),
        exam('e', { datum: '20.10.2024', createdAt: '2026-10-01T00:00:00Z' }),
      ],
      now,
    );
    expect(sections.map((s) => [s.key, s.items.map((e) => e.id), s.defaultOpen])).toEqual([
      ['favorites', ['b'], true],
      ['unclear', ['c'], true],
      ['year:2026', ['b'], true],
      ['year:2025', ['a'], false],
      ['year:2024', ['e'], false],
      ['archive', ['d'], false],
    ]);
  });

  it('drops empty sections', () => {
    expect(sectionExams([], now)).toEqual([]);
  });
});

describe('sectionByFlags', () => {
  it('lists favorites again under all and archived items only in the archive', () => {
    const items = [
      { id: 1, favorite: true, archived: false },
      { id: 2, favorite: false, archived: false },
      { id: 3, favorite: true, archived: true },
    ];
    const sections = sectionByFlags(items, (i) => i);
    expect(sections.map((s) => [s.key, s.items.map((i) => i.id)])).toEqual([
      ['favorites', [1]],
      ['all', [1, 2]],
      ['archive', [3]],
    ]);
  });
});
