import { describe, it, expect } from 'vitest';
import type { ExamRecord } from '../src/lib/db/schema';
import { parseExamDatum, schoolYearLabel, schoolYearOf, sectionByFlags, sectionExams } from '../src/lib/utils/listSections';

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
});

describe('sectionExams', () => {
  const now = new Date(2026, 10, 11);

  it('files exams by printed date, falls back to creation and keeps favorites in their year too', () => {
    const sections = sectionExams(
      [
        exam('a', { datum: '15.03.2026' }),
        exam('b', { isFavorite: true }),
        exam('c', { datum: 'irgendwann', createdAt: '2024-09-01T00:00:00Z' }),
        exam('d', { archivedAt: '2026-11-01T00:00:00Z', isFavorite: true }),
      ],
      now,
    );
    expect(sections.map((s) => [s.key, s.items.map((e) => e.id), s.defaultOpen])).toEqual([
      ['favorites', ['b'], true],
      ['year:2026', ['b'], true],
      ['year:2025', ['a'], false],
      ['year:2024', ['c'], false],
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
