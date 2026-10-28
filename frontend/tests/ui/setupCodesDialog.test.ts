// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import { translate } from '../../src/lib/i18n';
import SetupCodesDialog from '../../src/lib/components/security/SetupCodesDialog.svelte';

afterEach(cleanup);

const onConfirm = () => {};

describe('SetupCodesDialog', () => {
  it('labels both halves when given backup codes and a recovery code', async () => {
    const { getByText } = render(SetupCodesDialog, { backupCodes: ['AAAA-1111'], recoveryCode: 'RC-1', onConfirm });
    await tick();
    expect(getByText(translate('security.setupCodes.title'))).toBeTruthy();
    expect(getByText(translate('security.setupCodes.backupHeading'))).toBeTruthy();
    expect(getByText(translate('security.recovery.copy'))).toBeTruthy();
  });

  it('shows backup codes alone without headings or a copy button', async () => {
    const { getByText, queryByText } = render(SetupCodesDialog, { backupCodes: ['AAAA-1111'], onConfirm });
    await tick();
    expect(getByText(translate('security.backupCodes.title'))).toBeTruthy();
    expect(queryByText(translate('security.setupCodes.backupHeading'))).toBeNull();
    expect(queryByText(translate('security.recovery.copy'))).toBeNull();
  });

  it('shows the recovery code alone with its own confirm label', async () => {
    const { getByText } = render(SetupCodesDialog, { recoveryCode: 'RC-1', onConfirm });
    await tick();
    expect(getByText(translate('security.recovery.title'))).toBeTruthy();
    expect(getByText(translate('security.recovery.confirm')).closest('button')!.disabled).toBe(true);
  });
});
