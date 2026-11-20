import { describe, expect, it, vi } from 'vitest';

const get = vi.fn(async () => ({ account: { email: 'a@example.org' } }));
vi.mock('../src/lib/api/client', () => ({ api: { get: (...args: unknown[]) => get(...(args as [])) } }));

const { accountExportFileName, exportAccountData } = await import('../src/lib/api/account');

describe('account data export (GDPR Art. 15/20)', () => {
  it('reads the account export without the global error pop-up', async () => {
    await expect(exportAccountData()).resolves.toEqual({ account: { email: 'a@example.org' } });
    expect(get).toHaveBeenCalledWith('/user/me/export', { silentError: true });
  });

  it('dates the file name', () => {
    expect(accountExportFileName(new Date(2026, 0, 5))).toBe('examance-account-2026-01-05.json');
  });
});
