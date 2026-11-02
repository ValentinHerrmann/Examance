import { describe, it, expect } from 'vitest';
import type { StudentRecord } from '#lib/db/schema';
import { contactsFromLines, contactsFromMebisCsv, matchContacts, nameKey, parseCsv } from '#lib/lms/contacts';
import { incompatibleStudents, SHARE_CHANNELS } from '#lib/sharing/channels';
import { mebisFeedbackPath } from '#lib/export/examExport';
import { lmsIdOf, normalizeLmsId } from '#lib/utils/studentQr';

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

  it('reads the id from a sticker, never from a minted UUID', () => {
    expect(lmsIdOf({ pseudonymRaw: 'Muster, Max_Teilnehmer/in6028356' })).toBe('6028356');
    expect(lmsIdOf({ pseudonymRaw: 'Muster, Max_123' })).toBe('123');
    expect(lmsIdOf({ pseudonymRaw: '0b8f2a51-5c1e-4b8e-9a51-1f2e3d4c5b6a' })).toBeNull();
  });
});

describe('class list import', () => {
  it('parses quoted CSV cells with either separator', () => {
    expect(parseCsv('a,"b, c",d\n1,"x ""y""",3')).toEqual([['a', 'b, c', 'd'], ['1', 'x "y"', '3']]);
    expect(parseCsv('a;b\n1;2')).toEqual([['a', 'b'], ['1', '2']]);
  });

  it('reads a Mebis grading worksheet', () => {
    const csv = '﻿ID,"Vollständiger Name",E-Mail-Adresse,Status\n"Teilnehmer/in6028356","Max Muster",max@schule.de,Abgegeben\n';
    expect(contactsFromMebisCsv(csv)).toEqual([{ name: 'Max Muster', id: '6028356', email: 'max@schule.de' }]);
  });

  it('reads a participant list with first and last name', () => {
    const csv = 'Vorname;Nachname;E-Mail-Adresse\nErika;Beispiel;erika@schule.de';
    expect(contactsFromMebisCsv(csv)).toEqual([{ name: 'Beispiel, Erika', id: null, email: 'erika@schule.de' }]);
  });

  it('is null for a file without name columns', () => {
    expect(contactsFromMebisCsv('a,b\n1,2')).toBeNull();
  });

  it('takes id and address from pasted lines in any order', () => {
    expect(contactsFromLines('Muster, Max; 1042; max@schule.de\nBeispiel, Erika\tanna@x.de')).toEqual([
      { name: 'Muster, Max', id: '1042', email: 'max@schule.de' },
      { name: 'Beispiel, Erika', id: null, email: 'anna@x.de' },
    ]);
  });
});

describe('matchContacts', () => {
  it('matches by sticker id first, then by unambiguous name', () => {
    const a = student('Muster, Max', 'Muster, Max_7');
    const b = student('Beispiel, Erika');
    const c = student('Neu, Nora');
    const result = matchContacts([a, b, c], [
      { name: 'Somebody Else', id: '7', email: 'max@x.de' },
      { name: 'Erika Beispiel', id: null, email: 'erika@x.de' },
      { name: 'Unknown', id: '9', email: 'u@x.de' },
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
    const withMail = student('A', 'A_5', 'a@x.de');
    const without = student('B');
    expect(incompatibleStudents('code', email, [withMail, without]).map((b) => b.student)).toEqual([without]);
    expect(incompatibleStudents(null, artemis, [withMail, without]).map((b) => b.student)).toEqual([without]);
  });
});

describe('Mebis feedback ZIP', () => {
  it('uses Moodle’s per-participant folders', () => {
    expect(mebisFeedbackPath('Max Muster', '6028356')).toMatch(/^Participant_6028356_assignsubmission_file_\/.+_6028356\.pdf$/);
  });
});
