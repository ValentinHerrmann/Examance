// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import { translate } from '../../src/lib/i18n';

const exportAccountData = vi.fn();
const downloadBlob = vi.fn();
vi.mock('../../src/lib/api/account', () => ({ exportAccountData: () => exportAccountData(), accountExportFileName: () => 'examance-account-2026-11-20.json' }));
vi.mock('../../src/lib/utils/download', () => ({ downloadBlob: (...args: unknown[]) => downloadBlob(...args) }));

const { default: AccountDataCard } = await import('../../src/lib/components/settings/AccountDataCard.svelte');

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const settle = async () => {
  for (let i = 0; i < 5; i++) await tick();
};

describe('AccountDataCard', () => {
  it('saves the export as a dated JSON file', async () => {
    exportAccountData.mockResolvedValueOnce({ account: { email: 'a@example.org' } });
    render(AccountDataCard);
    await fireEvent.click(screen.getByRole('button', { name: translate('settings.accountData.button') }));
    await settle();
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = downloadBlob.mock.calls[0] as [Blob, string];
    expect(name).toBe('examance-account-2026-11-20.json');
    expect(JSON.parse(await blob.text())).toEqual({ account: { email: 'a@example.org' } });
  });

  it('leaves the per-student hint out for admins', async () => {
    render(AccountDataCard, { admin: true });
    expect(screen.getByText(translate('settings.accountData.descriptionAdmin'))).toBeTruthy();
    expect(screen.queryByText(translate('settings.accountData.description'))).toBeNull();
  });

  it('shows a failed export inline and saves nothing', async () => {
    exportAccountData.mockRejectedValueOnce(new Error('offline'));
    render(AccountDataCard);
    await fireEvent.click(screen.getByRole('button', { name: translate('settings.accountData.button') }));
    await settle();
    expect(downloadBlob).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeTruthy();
  });
});
