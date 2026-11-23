import { describe, expect, it } from 'vitest';
import { examFileBase, examFileName, FILE_KIND } from '#lib/export/fileName';

const exam = { datum: '05.11.2026', fach: 'Informatik', grade: '10', klasse: 'a', testart: 'Kurzarbeit', nr: '1', title: 'Kurzarbeit 1 · Informatik 10a' };

describe('exam file names (issue #337)', () => {
  it('starts with the exam date, then subject, course, type and number', () => {
    expect(examFileName(exam, [FILE_KIND.solution], 'pdf')).toBe('2026-11-05_Informatik_10a_Kurzarbeit_1_Loesung.pdf');
  });

  it('reads ISO dates and dates with a weekday', () => {
    expect(examFileBase({ ...exam, datum: '2026-03-02' })).toBe('2026-03-02_Informatik_10a_Kurzarbeit_1');
    expect(examFileBase({ ...exam, datum: 'Di, 24.09.26' })).toBe('2026-09-24_Informatik_10a_Kurzarbeit_1');
  });

  it('marks undated exams with a placeholder', () => {
    expect(examFileBase({ ...exam, datum: 'Nachtermin' })).toBe('0000-00-00_Informatik_10a_Kurzarbeit_1');
    expect(examFileBase({ ...exam, datum: undefined })).toBe('0000-00-00_Informatik_10a_Kurzarbeit_1');
  });

  it('falls back to the title, then to "exam", without subject, course, type and number', () => {
    expect(examFileBase({ datum: '05.11.2026', title: 'Probe Größe' })).toBe('2026-11-05_Probe_Groesse');
    expect(examFileBase({})).toBe('0000-00-00_exam');
  });

  it('uses the printed course override and skips empty parts', () => {
    expect(examFileName({ ...exam, course: 'Q11 inf1', nr: '' }, ['Müller, Jörg', '', null], 'pdf')).toBe('2026-11-05_Informatik_Q11_inf1_Kurzarbeit_Mueller_Joerg.pdf');
  });

  it('builds folder names without an extension', () => {
    expect(examFileName(exam, [])).toBe('2026-11-05_Informatik_10a_Kurzarbeit_1');
  });
});
