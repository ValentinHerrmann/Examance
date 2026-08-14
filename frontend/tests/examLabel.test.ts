import { describe, it, expect } from 'vitest';
import { formatExamCourse, parseDatumAndDauer, formatDatumAndDauer } from '../src/lib/utils/examLabel';

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
