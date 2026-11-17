import { describe, it, expect } from 'vitest';
import type { StudentRecord } from '#lib/db/schema';
import { contactsFromLines, contactsFromMebisCsv, matchContacts, nameKey, parseCsv, studentIdFor } from '#lib/lms/contacts';
import { channelUnavailable, incompatibleStudents, sendsPdf, SHARE_CHANNELS } from '#lib/sharing/channels';
import { mebisFeedbackPath } from '#lib/export/examExport';
import { artemisIdOf, mebisIdOf, normalizeLmsId } from '#lib/utils/studentQr';

const student = (name: string, raw?: string, email?: string): StudentRecord => ({
  examId: 'e1',
  pseudonymHmac: `h-${name}`,
  studentName: name,
  pseudonymRaw: raw,
  email,
  piiCt: new Uint8Array(0),
  piiIv: new Uint8Array(12),
});

describe('LMS ids', () => {
  it('strips the Mebis prefixes DiRueLei stickers carry', () => {
    expect(normalizeLmsId('Teilnehmer/in6028356')).toBe('6028356');
    expect(normalizeLmsId('Participant 42')).toBe('42');
    expect(normalizeLmsId('A12')).toBeNull();
  });

  // Regression (issue #284): the sticker's id counted as both kinds, so a Mebis number became an Artemis recipient.
  it('never take a Mebis or Artemis id from the sticker', () => {
    expect(mebisIdOf(student('M', 'Muster, Max_Teilnehmer/in6028356'))).toBeNull();
    expect(artemisIdOf(student('M', 'Muster, Max_123'))).toBeNull();
    expect(artemisIdOf({ ...student('M', 'Muster, Max_6028356'), mebisId: '6028356' })).toBeNull();
    expect(mebisIdOf({ ...student('M', 'Muster, Max_42'), artemisId: '42' })).toBeNull();
  });

  it('match a DiRueLei sticker with the Mebis prefix to its Mebis contact, nothing else', () => {
    const dirue = student('Muster, Max', 'Muster, Max_Teilnehmer/in6028356');
    expect(studentIdFor('mebis', dirue)).toBe('6028356');
    expect(studentIdFor('artemis', dirue)).toBeNull();
    expect(studentIdFor('mebis', student('Muster, Max', 'Muster, Max_6028356'))).toBeNull();
    const result = matchContacts([dirue], [{ name: 'Somebody Else', id: '6028356', email: null, source: 'mebis' }]);
    expect(result.matches.map((m) => m.student)).toEqual([dirue]);
  });

  it('prefers the stored Mebis and Artemis ids over the sticker one, each of its own kind', () => {
    const st = { ...student('M', 'Muster, Max_ABC123'), mebisId: '6028356', artemisId: '42' };
    expect(mebisIdOf(st)).toBe('6028356');
    expect(artemisIdOf(st)).toBe('42');
    expect(artemisIdOf({ ...student('M', 'Muster, Max_ABC123'), mebisId: '6028356' })).toBeNull();
  });
});

describe('class list import', () => {
  it('parses quoted CSV cells with either separator', () => {
    expect(parseCsv('a,"b, c",d\n1,"x ""y""",3')).toEqual([['a', 'b, c', 'd'], ['1', 'x "y"', '3']]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('reads a Mebis grading worksheet', () => {
    const csv = '﻿ID,"Vollständiger Name",E-Mail-Adresse,Status\n"Teilnehmer/in6028356","Max Muster",max@schule.de,Abgegeben\n';
    expect(contactsFromMebisCsv(csv)).toEqual([{ name: 'Max Muster', id: '6028356', email: 'max@schule.de', source: 'mebis' }]);
  });

  it('reads a participant list with first and last name', () => {
    const csv = 'Vorname;Nachname;E-Mail-Adresse\nErika;Beispiel;erika@schule.de';
    expect(contactsFromMebisCsv(csv)).toEqual([{ name: 'Beispiel, Erika', id: null, email: 'erika@schule.de', source: 'mebis' }]);
  });

  it('is null for a file without name columns', () => {
    expect(contactsFromMebisCsv('a,b\n1,2')).toBeNull();
  });

  it('takes id and address from pasted lines in any order', () => {
    expect(contactsFromLines('Muster, Max; 1042; max@schule.de\nBeispiel, Erika\tanna@x.de')).toEqual([
      { name: 'Muster, Max', id: '1042', email: 'max@schule.de', source: 'list' },
      { name: 'Beispiel, Erika', id: null, email: 'anna@x.de', source: 'list' },
    ]);
  });
});

describe('matchContacts', () => {
  it('matches by sticker id first, then by unambiguous name', () => {
    const a = student('Muster, Max', 'Muster, Max_7');
    const b = student('Beispiel, Erika');
    const c = student('Neu, Nora');
    const result = matchContacts([a, b, c], [
      { name: 'Somebody Else', id: '7', email: 'max@x.de', source: 'list' },
      { name: 'Erika Beispiel', id: null, email: 'erika@x.de', source: 'list' },
      { name: 'Unknown', id: '9', email: 'u@x.de', source: 'list' },
    ]);
    expect(result.matches.map((m) => [m.student, m.contact.email])).toEqual([
      [a, 'max@x.de'],
      [b, 'erika@x.de'],
    ]);
    expect(result.unmatchedStudents).toEqual([c]);
    expect(result.unmatchedContacts.map((x) => x.email)).toEqual(['u@x.de']);
  });

  it('ignores name order and case', () => {
    expect(nameKey('Muster, Max')).toBe(nameKey('max  MUSTER'));
  });
});

describe('delivery channels', () => {
  const email = SHARE_CHANNELS.find((c) => c.id === 'email')!;
  const artemis = SHARE_CHANNELS.find((c) => c.id === 'artemis')!;

  it('never offer a link that opens alone through a third party', () => {
    expect(email.factors).not.toContain('none');
    expect(artemis.factors).not.toContain('none');
  });

  it('skip students without an address or Artemis id', () => {
    const withMail = { ...student('A', 'A_5', 'a@x.de'), artemisId: '5' };
    const without = student('B');
    expect(incompatibleStudents('code', email, [withMail, without]).map((b) => b.student)).toEqual([without]);
    expect(incompatibleStudents(null, artemis, [withMail, without]).map((b) => b.student)).toEqual([without]);
  });

  // Regression (issue #284): each channel reaches only students with a stored id of its own kind.
  it('reach a Mebis-only student never on Artemis and an Artemis-only one never on Mebis', () => {
    const mebis = SHARE_CHANNELS.find((c) => c.id === 'mebis')!;
    const fromMebis = { ...student('A', 'A_6028356'), mebisId: '6028356' };
    const fromArtemis = { ...student('B', 'B_42'), artemisId: '42' };
    const stickerOnly = student('C', 'C_Teilnehmer/in777');
    expect(incompatibleStudents('code', artemis, [fromMebis, fromArtemis, stickerOnly]).map((b) => b.student)).toEqual([fromMebis, stickerOnly]);
    expect(incompatibleStudents(null, mebis, [fromMebis, fromArtemis, stickerOnly]).map((b) => b.student)).toEqual([fromArtemis, stickerOnly]);
  });

  // Regression: unavailable channels were hidden; they are listed greyed out with the reason instead.
  it('name why a channel is unavailable instead of hiding it', () => {
    const mebis = SHARE_CHANNELS.find((c) => c.id === 'mebis')!;
    const off = { result_delivery: false, result_mail: false };
    expect(channelUnavailable(email, off)).toBe('sharing.channels.unavailable.switchOff');
    expect(channelUnavailable(artemis, off)).toBe('sharing.channels.unavailable.switchOff');
    expect(channelUnavailable(email, { result_delivery: true, result_mail: false })).toBe('sharing.channels.unavailable.noMailServer');
    expect(channelUnavailable(email, { result_delivery: true, result_mail: true })).toBeNull();
    expect(channelUnavailable(mebis, off)).toBeNull();
  });

  it('send the Mebis PDFs themselves and skip students without a Mebis id', () => {
    const mebis = SHARE_CHANNELS.find((c) => c.id === 'mebis')!;
    expect(sendsPdf('mebis', 'link')).toBe(true);
    expect(sendsPdf('artemis', 'link')).toBe(false);
    const withId = { ...student('A', 'A_6028356'), mebisId: '6028356' };
    const without = student('B');
    expect(incompatibleStudents(null, mebis, [withId, without]).map((b) => b.student)).toEqual([without]);
  });
});

describe('Mebis feedback ZIP', () => {
  it('uses Moodle’s per-participant folders', () => {
    expect(mebisFeedbackPath('Max Muster', '6028356')).toMatch(/^Participant_6028356_assignsubmission_file_\/.+_6028356\.pdf$/);
  });
});
