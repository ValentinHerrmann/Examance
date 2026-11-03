import { describe, it, expect, vi } from 'vitest';
import type { StudentRecord } from '#lib/db/schema';

vi.mock('#lib/crypto/stickerKey', () => ({
  personalKey: vi.fn(async (raw: string) => `KEY${raw.length}`),
  stickerId: vi.fn(async () => 'NAMEID'),
}));
vi.mock('#lib/services/pseudonymRekey', () => ({
  pseudonymFor: vi.fn(async (_examId: string, raw: string) => ({ pseudonymHmac: `keyed:${raw}`, pseudonymVersion: 2, pseudonymRaw: raw })),
}));
const artemis = vi.hoisted(() => ({ messages: [] as string[] }));
vi.mock('#lib/api/integrations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('#lib/api/integrations')>()),
  sendArtemisMessage: vi.fn(async (_t: unknown, _u: number, text: string) => {
    artemis.messages.push(text);
  }),
  sendResultMails: vi.fn(async () => []),
}));

const { planImport, listedStudent, mergeStudents, duplicateCandidates, editWarnings } = await import('#lib/students/classList');
const { shareCode } = await import('#lib/sharing/shareService');
const { createDelivery } = await import('#lib/sharing/delivery');
const { setLocale } = await import('#lib/i18n');

const student = (name: string, raw?: string, extra: Partial<StudentRecord> = {}): StudentRecord => ({
  examId: 'e1',
  pseudonymHmac: `h-${name}`,
  studentName: name,
  pseudonymRaw: raw,
  piiCt: new Uint8Array(0),
  piiIv: new Uint8Array(12),
  ...extra,
});

describe('class list import', () => {
  it('adds unknown names, updates changed addresses and leaves the rest', () => {
    const anna = student('Muster, Anna', 'Muster, Anna_6028356', { email: 'old@x.de', fromList: true, mebisId: '6028356' });
    const ben = student('Beispiel, Ben', 'Beispiel, Ben_7', { email: 'ben@x.de', fromList: true, mebisId: '7' });
    const plan = planImport(
      [anna, ben],
      [
        { name: 'Muster, Anna', id: '6028356', email: 'anna@x.de', source: 'mebis' },
        { name: 'Beispiel, Ben', id: '7', email: 'ben@x.de', source: 'mebis' },
        { name: 'Neu, Nora', id: null, email: null, source: 'list' },
      ]
    );
    expect(plan.add.map((c) => c.name)).toEqual(['Neu, Nora']);
    expect(plan.update).toEqual([{ student: anna, changes: { email: 'anna@x.de' } }]);
    expect(plan.unchanged).toBe(1);
  });

  it('adds the Artemis id to a student imported from Mebis instead of a second row', () => {
    const anna = student('Muster, Anna', 'Muster, Anna_6028356', { fromList: true, mebisId: '6028356' });
    const plan = planImport([anna], [{ name: 'Anna Muster', id: '4711', email: 'anna@tum.de', source: 'artemis' }]);
    expect(plan.add).toEqual([]);
    expect(plan.update).toEqual([{ student: anna, changes: { email: 'anna@tum.de', artemisId: '4711' } }]);
  });

  it('keys a listed student by the sticker payload a scan reads back', async () => {
    const withId = await listedStudent('e1', { name: 'Muster, Anna', id: '6028356', email: 'a@x.de', source: 'mebis' });
    expect(withId).toMatchObject({ pseudonymRaw: 'Muster, Anna_6028356', email: 'a@x.de', fromList: true, studentName: 'Muster, Anna', mebisId: '6028356' });
    const withoutId = await listedStudent('e1', { name: 'Neu, Nora', id: null, email: null, source: 'list' });
    expect(withoutId.pseudonymRaw).toBe('Neu, Nora_NAMEID');
  });
});

describe('merging duplicates', () => {
  // The user's case: stickers printed without an LMS id, the list imported afterwards, then the scan.
  const scanned = student('Muster, Anna', 'Muster, Anna_K7Q2XZ');
  const listed = student('Anna Muster', 'Muster, Anna_6028356', { fromList: true, mebisId: '6028356', email: 'anna@x.de' });
  const has = (st: StudentRecord) => st === scanned;

  it('keeps the scanned row and its sticker, and takes id and address from the list row', () => {
    const plan = mergeStudents(listed, scanned, has);
    if ('refused' in plan) throw new Error('refused');
    expect(plan.keep).toBe(scanned);
    expect(plan.drop).toBe(listed);
    expect(plan.merged).toMatchObject({ pseudonymHmac: scanned.pseudonymHmac, pseudonymRaw: 'Muster, Anna_K7Q2XZ', mebisId: '6028356', email: 'anna@x.de', fromList: true });
    expect(plan.choices).toEqual([{ field: 'studentName', keepValue: 'Muster, Anna', otherValue: 'Anna Muster', equivalent: true }]);
    expect(plan.filled).toEqual(['mebisId', 'email']);
  });

  it('gives a Mebis row and an Artemis row of one student both ids, and reports conflicting values', () => {
    const mebis = student('Muster, Anna', 'Muster, Anna_6028356', { fromList: true, mebisId: '6028356', email: 'a@schule.de' });
    const artemis = student('Anna Muster', 'Muster, Anna_4711', { fromList: true, artemisId: '4711', email: 'a@tum.de' });
    const plan = mergeStudents(mebis, artemis, () => false);
    if ('refused' in plan) throw new Error('refused');
    expect(plan.merged).toMatchObject({ mebisId: '6028356', artemisId: '4711' });
    expect(plan.choices).toEqual([
      { field: 'studentName', keepValue: 'Muster, Anna', otherValue: 'Anna Muster', equivalent: true },
      { field: 'email', keepValue: 'a@schule.de', otherValue: 'a@tum.de', equivalent: false },
    ]);
  });

  it('refuses two scanned rows', () => {
    expect(mergeStudents(scanned, listed, () => true)).toEqual({ refused: 'lms.students.merge.bothScanned' });
  });

  it('suggests pairs with the same name', () => {
    const other = student('Beispiel, Ben', 'Beispiel, Ben_7');
    expect(duplicateCandidates([scanned, other, listed], has)).toEqual([[scanned, listed]]);
  });
});

describe('bulk edit warnings', () => {
  it('warn about side effects and block only an empty name', () => {
    const scanned = student('Muster, Anna', 'Muster, Anna_1', { mebisId: '1', email: 'a@x.de' });
    const ben = student('Beispiel, Ben', 'Beispiel, Ben_2', { mebisId: '2' });
    const after = [{ ...scanned, studentName: 'Muster, Anne', mebisId: '2', email: undefined }];
    const keys = editWarnings([scanned], after, [after[0], ben], (st) => st.pseudonymHmac === scanned.pseudonymHmac).map((n) => n.key);
    const filledNumber = mergeStudents(student('X, Y', 'X, Y_1', { studentNumber: '17' }), student('X, Y', 'X, Y_2', { fromList: true }), () => false);
    if (!('refused' in filledNumber)) expect(filledNumber.merged.studentNumber).toBe('17');
    expect(keys).toEqual([
      'lms.students.edit.warn.renamedScanned',
      'lms.students.edit.warn.idChanged',
      'lms.students.edit.warn.duplicateId',
      'lms.students.edit.warn.emailRemoved',
    ]);
    // A single-row edit gets the same warnings (one dialog for one or many rows).
    const single = editWarnings([scanned], [{ ...scanned, studentName: 'Muster, Annika' }], [scanned], () => true);
    expect(single.map((n) => n.key)).toEqual(['lms.students.edit.warn.renamedScanned']);
    const empty = editWarnings([ben], [{ ...ben, studentName: ' ' }], [ben], () => false);
    expect(empty).toEqual([{ key: 'lms.students.edit.warn.emptyName', name: 'Beispiel, Ben', blocking: true }]);
  });
});

describe('share codes', () => {
  // Regression: the code factor made a fresh code, so its slips could not replace a lost sticker key.
  it('reuse the personal key of the sticker for the code factor', async () => {
    expect(await shareCode('code', 'Muster, Anna_1')).toBe('KEY14');
    expect(await shareCode('sticker', 'Muster, Anna_1')).toBe('KEY14');
    expect(await shareCode('code', null)).toMatch(/^[A-Z2-9]{8}$/);
    expect(await shareCode('sticker', null)).toBeNull();
    expect(await shareCode('none', 'Muster, Anna_1')).toBeNull();
  });
});

describe('Artemis messages', () => {
  it('use the chosen language whatever the UI shows, and carry the key only when asked', async () => {
    setLocale('en');
    const delivery = createDelivery('artemis', {
      examTitle: 'Analysis',
      expiresAt: new Date('2026-12-01T00:00:00Z'),
      language: 'de',
      artemis: { host: 'artemis.example', courseId: 1, jwt: 't', mode: 'link' },
    });
    const anna = student('Muster, Anna', 'Muster, Anna_6028356');
    await delivery.deliverLink(anna, 'Anna', 'https://x/result#a.b', null);
    await delivery.deliverLink(anna, 'Anna', 'https://x/result#a.b', 'ABCD2345');
    expect(artemis.messages[0]).toContain('Deine korrigierte Prüfung');
    expect(artemis.messages[0]).not.toContain('ABCD');
    expect(artemis.messages[1]).toContain('ABCD-2345');
  });
});

describe('e-mail progress', () => {
  // Sending a class takes a while: the dialog shows "x of y sent" per batch of 20.
  it('reports the mails sent after each batch', async () => {
    const delivery = createDelivery('email', { examTitle: 'Analysis', expiresAt: new Date(), language: 'de' });
    for (let i = 0; i < 45; i++) await delivery.deliverLink(student(`S${i}`, undefined, { email: `s${i}@x.de` }), `S${i}`, 'https://x/result#a.b', null);
    const seen: [number, number][] = [];
    expect(await delivery.finish((done, total) => seen.push([done, total]))).toEqual([]);
    expect(seen).toEqual([[0, 45], [20, 45], [40, 45], [45, 45]]);
  });
});
