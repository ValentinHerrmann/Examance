import { describe, expect, it } from 'vitest';
import { examBaseMinutes, extensionFrom, extensionLabel, extensionMinutes, printedExtension, sameExtension } from '../src/lib/students/timeExtension';
import { mergeScannedStudent } from '../src/lib/scan/ingest';
import { studentsStamp } from '../src/lib/exam/examChecks';
import type { StudentRecord } from '../src/lib/db/schema';

const student = (extra: Partial<StudentRecord> = {}): StudentRecord => ({ examId: 'e', pseudonymHmac: 'h', studentName: 'Adam, Lena', piiCt: new Uint8Array(0), piiIv: new Uint8Array(12), ...extra });

describe('time extension (issue #265)', () => {
  it('reads the typed value; empty, zero and text mean none', () => {
    expect(extensionFrom('25', '%')).toEqual({ value: 25, unit: '%' });
    expect(extensionFrom(' 7,5 ', 'min')).toEqual({ value: 7.5, unit: 'min' });
    expect(extensionFrom('', '%')).toBeUndefined();
    expect(extensionFrom('0', 'min')).toBeUndefined();
    expect(extensionFrom('viel', 'min')).toBeUndefined();
    // Above 1000 % Examtimer refuses the whole link.
    expect(extensionFrom('1000', '%')).toEqual({ value: 1000, unit: '%' });
    expect(extensionFrom('1001', '%')).toBeUndefined();
    expect(extensionFrom('1440', 'min')).toEqual({ value: 1440, unit: 'min' });
  });

  it('takes a share of working plus reading time', () => {
    expect(examBaseMinutes({ durationMinutes: 45, readingMinutes: 5 })).toBe(50);
    expect(examBaseMinutes({ durationMinutes: 45 })).toBe(45);
    expect(examBaseMinutes({ readingMinutes: 5 })).toBeNull();
    expect(printedExtension({ value: 25, unit: '%' }, examBaseMinutes({ durationMinutes: 45, readingMinutes: 5 }))).toBe('+25 % (+12,5 Min)');
  });

  it('rounds a share up to half minutes and never adds to an exact value', () => {
    expect(extensionMinutes({ value: 25, unit: '%' }, 30)).toBe(7.5);
    expect(extensionMinutes({ value: 25, unit: '%' }, 45)).toBe(11.5);
    expect(extensionMinutes({ value: 10, unit: '%' }, 41)).toBe(4.5);
    expect(extensionMinutes({ value: 50, unit: '%' }, 60)).toBe(30);
    expect(extensionMinutes({ value: 25, unit: '%' }, null)).toBeNull();
    expect(extensionMinutes({ value: 10, unit: 'min' }, null)).toBe(10);
  });

  it('prints minutes as they are and a share with its minutes', () => {
    expect(extensionLabel({ value: 7.5, unit: 'min' })).toBe('+7,5 Min');
    expect(printedExtension({ value: 10, unit: 'min' }, 30)).toBe('+10 Min');
    expect(printedExtension({ value: 25, unit: '%' }, 30)).toBe('+25 % (+7,5 Min)');
    expect(printedExtension({ value: 25, unit: '%' }, undefined)).toBe('+25 %');
    expect(sameExtension({ value: 25, unit: '%' }, { value: 25, unit: 'min' })).toBe(false);
    expect(sameExtension(undefined, undefined)).toBe(true);
  });

  it('survives a scan of the student', () => {
    const existing = student({ timeExtension: { value: 25, unit: '%' } });
    expect(mergeScannedStudent(existing, student()).timeExtension).toEqual({ value: 25, unit: '%' });
  });

  it('marks printed stickers and copies as outdated when it changes', () => {
    const plain = studentsStamp([student()]);
    const share = studentsStamp([student({ timeExtension: { value: 25, unit: '%' } })], 30);
    expect(share).not.toBe(plain);
    expect(studentsStamp([student({ timeExtension: { value: 25, unit: '%' } })], 45)).not.toBe(share);
    expect(studentsStamp([student()], 45)).toBe(plain);
  });
});
