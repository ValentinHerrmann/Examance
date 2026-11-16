import { describe, expect, it } from 'vitest';
import { buildTimerData, parseTimerFragment, timerExtensionLabels, timerLink, validTimerUrl } from '../src/lib/export/examTimer';
import { givenName } from '../src/lib/utils/studentQr';
import type { ExamRecord, StudentRecord } from '../src/lib/db/schema';

const exam = { id: 'e', title: 'KA 1', testart: 'Kurzarbeit', nr: '1', fach: 'Mathematik', grade: '10', klasse: 'a', durationMinutes: 45 } as ExamRecord;
const student = (name: string, timeExtension?: StudentRecord['timeExtension']): StudentRecord => ({ examId: 'e', pseudonymHmac: name, studentName: name, timeExtension, piiCt: new Uint8Array(0), piiIv: new Uint8Array(12) });
const students = [student('Adam, Lena Marie', { value: 25, unit: '%' }), student('Berg, Max', { value: 25, unit: '%' }), student('Çelik, Ömer', { value: 10, unit: 'min' }), student('Dorn, Eva')];

describe('Examtimer export (issue #265)', () => {
  it('lists each distinct extension once and never a name by default', () => {
    const data = buildTimerData(exam, students, { names: false });
    expect(data.settings).toEqual({
      course: '10a',
      subject: 'Mathematik',
      exam: 'Kurzarbeit 1',
      duration: '45',
      extensions: [{ value: 10, unit: 'min', label: '' }, { value: 25, unit: '%', label: '' }],
    });
    expect(JSON.stringify(data)).not.toMatch(/Lena|Max|Ömer|Adam|Berg/);
  });

  it('labels an extension with the first name only when one student holds it', () => {
    const data = buildTimerData(exam, students, { names: true });
    expect(data.settings.extensions).toEqual([{ value: 10, unit: 'min', label: 'Ömer' }, { value: 25, unit: '%', label: '' }]);
    expect(timerExtensionLabels(data)).toEqual(['+10 Min (Ömer)', '+25 %']);
    expect(givenName('Adam, Lena Marie')).toBe('Lena');
    expect(givenName('Lena Marie Adam')).toBe('Lena');
  });

  it('carries the data in the fragment of the control page, readable again', () => {
    const data = buildTimerData(exam, students, { names: true });
    const link = new URL(timerLink('https://timer.example/app', data));
    expect(link.origin + link.pathname).toBe('https://timer.example/app/control');
    expect(link.search).toBe('');
    expect(parseTimerFragment(link.hash)).toEqual(data);
  });

  it('accepts only https addresses, or http on this computer', () => {
    expect(validTimerUrl('https://timer.example')).toBe('https://timer.example/');
    expect(validTimerUrl('http://localhost:8080/')).toBe('http://localhost:8080/');
    expect(validTimerUrl('http://timer.example/')).toBeNull();
    expect(validTimerUrl('javascript:alert(1)')).toBeNull();
    expect(validTimerUrl('timer')).toBeNull();
  });
});
