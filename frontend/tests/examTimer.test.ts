import { describe, expect, it } from 'vitest';
import { buildTimerData, timerExtensionLabels, timerLink, timerLinkProblem, timerSubject, validTimerUrl } from '../src/lib/export/examTimer';
import { givenName } from '../src/lib/utils/studentQr';
import type { ExamRecord, StudentRecord } from '../src/lib/db/schema';

const exam = { id: 'e', title: 'KA 1', testart: 'Kurzarbeit', nr: '1', fach: 'Mathematik', grade: '10', klasse: 'a', durationMinutes: 45 } as ExamRecord;
const student = (name: string, timeExtension?: StudentRecord['timeExtension']): StudentRecord => ({ examId: 'e', pseudonymHmac: name, studentName: name, timeExtension, piiCt: new Uint8Array(0), piiIv: new Uint8Array(12) });
const students = [student('Adam, Lena Marie', { value: 25, unit: '%' }), student('Berg, Max', { value: 25, unit: '%' }), student('Çelik, Ömer', { value: 10, unit: 'min' }), student('Dorn, Eva')];

/** Reads a v1 link back as Examtimer would: parameters in the fragment, `+` as space. */
function parseLink(link: string): { path: string; params: [string, string][] } {
  const url = new URL(link);
  const params = url.hash.slice(1).split('&').map((part) => {
    const at = part.indexOf('=');
    return [part.slice(0, at), decodeURIComponent(part.slice(at + 1).replaceAll('+', ' '))] as [string, string];
  });
  return { path: url.origin + url.pathname + url.search, params };
}

describe('Examtimer export (issue #265)', () => {
  it('lists each distinct extension once in minutes and never a name by default', () => {
    const data = buildTimerData(exam, students, { names: false });
    expect(data.settings).toEqual({
      course: '10a',
      subject: 'Mathematik',
      exam: 'Kurzarbeit 1',
      duration: '45',
      readingTime: '0',
      // 25 % of 45 minutes, rounded up to half minutes.
      extensions: [{ value: 10, unit: 'min', label: '' }, { value: 11.5, unit: 'min', label: '' }],
    });
    expect(JSON.stringify(data)).not.toMatch(/Lena|Max|Ömer|Adam|Berg/);
  });

  it('takes a share of working plus reading time, as printed on the paper', () => {
    const data = buildTimerData({ ...exam, readingMinutes: 5 }, [student('Adam, Lena', { value: 25, unit: '%' })], { names: false });
    expect(data.settings.readingTime).toBe('5');
    expect(data.settings.extensions).toEqual([{ value: 12.5, unit: 'min', label: '' }]);
  });

  it('labels an extension with the first name only when one student holds it', () => {
    const data = buildTimerData(exam, students, { names: true });
    expect(data.settings.extensions).toEqual([{ value: 10, unit: 'min', label: 'Ömer' }, { value: 11.5, unit: 'min', label: '' }]);
    expect(timerExtensionLabels(data)).toEqual(['+10 Min (Ömer)', '+11,5 Min']);
    expect(givenName('Adam, Lena Marie')).toBe('Lena');
    expect(givenName('Lena Marie Adam')).toBe('Lena');
  });

  it('builds the readable link format v1 on the control page', () => {
    const data = buildTimerData({ ...exam, readingMinutes: 5 }, [student('Adam, Lena', { value: 10, unit: 'min' }), student('Berg, Max', { value: 25, unit: '%' })], { names: true });
    expect(timerLink('https://timer.example', data)).toBe(
      'https://timer.example/control#v=1&course=10a&exam=Kurzarbeit+1&subject=Mathematik&duration=45&readingTime=5&ext=10min:Lena&ext=12.5min:Max',
    );
  });

  it('encodes umlauts, & and : in values and clears the extensions when there are none', () => {
    const odd = { ...exam, testart: 'Prüfung & Test', nr: '', klasse: 'b:1' } as ExamRecord;
    const data = buildTimerData(odd, [student('Weiß, Jörg-Ünal', { value: 7.25, unit: 'min' })], { names: true });
    const link = timerLink('https://timer.example/app/', data);
    expect(link).toContain('exam=Pr%C3%BCfung+%26+Test');
    expect(link).toContain('ext=7.25min:J%C3%B6rg-%C3%9Cnal');
    const { path, params } = parseLink(link);
    expect(path).toBe('https://timer.example/app/control');
    expect(params).toContainEqual(['exam', 'Prüfung & Test']);
    expect(params).toContainEqual(['course', '10b:1']);
    expect(params).toContainEqual(['ext', '7.25min:Jörg-Ünal']);
    expect(timerLink('https://timer.example', buildTimerData(exam, [], { names: false }))).toMatch(/&readingTime=0&ext=$/);
  });

  it('sends the subject in Examtimer spelling, else Sonstige', () => {
    expect(timerSubject(' mathematik ')).toBe('Mathematik');
    expect(timerSubject('ev. religion')).toBe('Ev. Religion');
    expect(timerSubject('Info')).toBe('Sonstige');
    expect(timerSubject('')).toBe('Sonstige');
  });

  it('blocks the link without a working time or with more than 20 extensions', () => {
    expect(timerLinkProblem(buildTimerData(exam, students, { names: false }))).toBeNull();
    expect(timerLinkProblem(buildTimerData({ ...exam, durationMinutes: null }, [], { names: false }))).toBe('noDuration');
    const many = Array.from({ length: 21 }, (_, i) => student(`S${i}`, { value: i + 1, unit: 'min' }));
    expect(timerLinkProblem(buildTimerData(exam, many, { names: false }))).toBe('tooMany');
  });

  it('accepts only https addresses, or http on this computer', () => {
    expect(validTimerUrl('https://timer.example')).toBe('https://timer.example/');
    expect(validTimerUrl('http://localhost:8080/')).toBe('http://localhost:8080/');
    expect(validTimerUrl('http://timer.example/')).toBeNull();
    expect(validTimerUrl('javascript:alert(1)')).toBeNull();
    expect(validTimerUrl('timer')).toBeNull();
  });
});
