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
}));

const { planImport, listedStudent } = await import('#lib/students/classList');
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
    const anna = student('Muster, Anna', 'Muster, Anna_6028356', { email: 'old@x.de', fromList: true });
    const ben = student('Beispiel, Ben', 'Beispiel, Ben_7', { email: 'ben@x.de', fromList: true });
    const plan = planImport(
      [anna, ben],
      [
        { name: 'Muster, Anna', id: '6028356', email: 'anna@x.de' },
        { name: 'Beispiel, Ben', id: '7', email: 'ben@x.de' },
        { name: 'Neu, Nora', id: null, email: null },
      ]
    );
    expect(plan.add.map((c) => c.name)).toEqual(['Neu, Nora']);
    expect(plan.update).toEqual([{ student: anna, email: 'anna@x.de' }]);
    expect(plan.unchanged).toBe(1);
  });

  it('keys a listed student by the sticker payload a scan reads back', async () => {
    const withId = await listedStudent('e1', { name: 'Muster, Anna', id: '6028356', email: 'a@x.de' });
    expect(withId).toMatchObject({ pseudonymRaw: 'Muster, Anna_6028356', email: 'a@x.de', fromList: true, studentName: 'Muster, Anna' });
    const withoutId = await listedStudent('e1', { name: 'Neu, Nora', id: null, email: null });
    expect(withoutId.pseudonymRaw).toBe('Neu, Nora_NAMEID');
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
