import { describe, it, expect } from 'vitest';
import { examCourse, exerciseTopicSuggestions, formatExamCourse, generatedExamTitle, parseDatumAndDauer, formatDatumAndDauer } from '../src/lib/utils/examLabel';
import { randomStrings, timeMs } from './helpers/randomStrings';

describe('formatExamCourse', () => {
  it('concatenates grade and course letter', () => {
    expect(formatExamCourse('10', 'a')).toBe('10a');
    expect(formatExamCourse('9', 'b')).toBe('9b');
    expect(formatExamCourse('11', 'Q1')).toBe('11Q1');
  });

  it('handles missing grade or course gracefully', () => {
    expect(formatExamCourse('10', '')).toBe('10');
    expect(formatExamCourse('', 'a')).toBe('a');
    expect(formatExamCourse(null, '10a')).toBe('10a');
    expect(formatExamCourse(undefined, undefined)).toBe('');
  });

  it('avoids double grade prefix if course already starts with grade', () => {
    expect(formatExamCourse('10', '10a')).toBe('10a');
  });
});

describe('parseDatumAndDauer & formatDatumAndDauer', () => {
  it('parses combined string into date and duration', () => {
    expect(parseDatumAndDauer('20.05.2025 (30 Min)')).toEqual({
      datumDate: '20.05.2025',
      dauer: '30 Min',
    });
    expect(parseDatumAndDauer('14.08.2026')).toEqual({
      datumDate: '14.08.2026',
      dauer: '',
    });
    expect(parseDatumAndDauer('')).toEqual({
      datumDate: '',
      dauer: '',
    });
  });

  it('formats separate date and duration into combined string', () => {
    expect(formatDatumAndDauer('20.05.2025', '30 Min')).toBe('20.05.2025 (30 Min)');
    expect(formatDatumAndDauer('20.05.2025', '')).toBe('20.05.2025');
    expect(formatDatumAndDauer('', '45 Min')).toBe('(45 Min)');
  });
});

describe('examCourse', () => {
  it('prefers the stored course over grade + klasse', () => {
    expect(examCourse({ grade: '11', klasse: 'a', course: 'Q11 Inf' })).toBe('Q11 Inf');
  });
  it('falls back to grade + klasse when the course is blank', () => {
    expect(examCourse({ grade: '10', klasse: 'a', course: '  ' })).toBe('10a');
  });
});

describe('generatedExamTitle', () => {
  it('joins type, number, subject, course and date', () => {
    const exam = { testart: 'Kurzarbeit', nr: '1', fach: 'Informatik', grade: '10', klasse: 'a', datum: '05.11.2026 (30 Minuten)' };
    expect(generatedExamTitle(exam, 'Exam')).toBe('Kurzarbeit 1 · Informatik 10a · 05.11.2026');
  });
  it('skips empty parts', () => {
    expect(generatedExamTitle({ fach: 'Mathe', course: 'Q12' }, 'Exam')).toBe('Mathe Q12');
  });
  it('uses the fallback when everything is empty', () => {
    expect(generatedExamTitle({}, 'Exam')).toBe('Exam');
  });
});

describe('exerciseTopicSuggestions', () => {
  it('lists distinct topics in natural, case-insensitive order (issue #244)', () => {
    const topics = ['Kapitel 10', 'algebra', 'Kapitel 2', '_General', 'Ähnlichkeit', 'Kapitel 2', 'Zahlen'];
    expect(exerciseTopicSuggestions(topics.map((topicTag) => ({ topicTag })))).toEqual([
      'Ähnlichkeit', 'algebra', 'Kapitel 2', 'Kapitel 10', 'Zahlen',
    ]);
  });
});

describe('parseDatumAndDauer matches the former regex (SonarCloud S8786)', () => {
  function legacy(raw: string): { datumDate: string; dauer: string } {
    const str = raw.trim();
    const match = /^(.*?)(?:\s*\((.*?)\))?$/.exec(str); // NOSONAR: the old regex is the oracle
    return match?.[2] === undefined ? { datumDate: str, dauer: '' } : { datumDate: match[1].trim(), dauer: match[2].trim() };
  }

  it('on random input', () => {
    for (const s of randomStrings(['(', ')', ' ', '1', '.', 'Min', '\n', ' ', '\t'], 4000, 10, 5)) {
      if (!s) continue;
      expect(parseDatumAndDauer(s)).toEqual(legacy(s));
    }
  });

  it('stays linear on long input', () => {
    expect(timeMs(() => parseDatumAndDauer('('.repeat(50_000) + ' '.repeat(50_000) + 'x'))).toBeLessThan(200);
    expect(timeMs(() => parseDatumAndDauer('(\n'.repeat(50_000) + ')'))).toBeLessThan(200);
  });
});
