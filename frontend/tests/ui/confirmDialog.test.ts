// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import ConfirmDialog from '../../src/lib/components/ui/ConfirmDialog.svelte';

afterEach(cleanup);

const props = { open: true, title: 'Del', message: 'Sure?', confirmText: 'Yes', cancelText: 'No' };

describe('ConfirmDialog', () => {
  it('fires confirm and cancel callbacks', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const { getByText, getByRole } = render(ConfirmDialog, { ...props, onConfirm, onCancel });
    await tick();
    expect(getByRole('alertdialog')).toBeTruthy();
    await fireEvent.click(getByText('Yes'));
    await fireEvent.click(getByText('No'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('busy disables the confirm button', async () => {
    const onConfirm = vi.fn();
    const { getByText } = render(ConfirmDialog, { ...props, busy: true, onConfirm });
    await tick();
    const btn = getByText('Yes').closest('button')!;
    expect(btn.disabled).toBe(true);
    await fireEvent.click(btn);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
