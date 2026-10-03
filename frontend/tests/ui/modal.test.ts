// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';
import Modal from '../../src/lib/components/ui/Modal.svelte';

const flush = async () => {
  await tick();
  await tick();
};

beforeEach(() => {
  document.body.innerHTML = '<div class="app-main"></div>';
});
afterEach(cleanup);

describe('Modal', () => {
  it('Escape calls onClose', async () => {
    const onClose = vi.fn();
    render(Modal, { open: true, title: 'T', onClose });
    await flush();
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignores backdrop clicks by default, honours closeOnBackdrop', async () => {
    const onClose = vi.fn();
    const a = render(Modal, { open: true, title: 'T', onClose });
    await flush();
    await fireEvent.click(a.getByRole('dialog').parentElement!);
    expect(onClose).not.toHaveBeenCalled();
    cleanup();

    const b = render(Modal, { open: true, title: 'T', onClose, closeOnBackdrop: true });
    await flush();
    await fireEvent.click(b.getByRole('dialog').parentElement!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses role alertdialog when asked', async () => {
    const { getByRole } = render(Modal, { open: true, title: 'T', role: 'alertdialog' });
    await flush();
    expect(getByRole('alertdialog')).toBeTruthy();
  });

  it('moves focus into the dialog and restores it on close', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { getByRole, component } = render(Modal, { open: true, title: 'T' });
    await flush();
    expect(getByRole('dialog').contains(document.activeElement)).toBe(true);
    component.$set({ open: false });
    await flush();
    expect(document.activeElement).toBe(opener);
  });

  it('stacked modals: only the top reacts to Escape; scroll stays locked until both close', async () => {
    const closeA = vi.fn();
    const closeB = vi.fn();
    const main = document.querySelector('.app-main') as HTMLElement;
    const a = render(Modal, { open: true, title: 'A', onClose: closeA });
    await flush();
    const b = render(Modal, { open: true, title: 'B', onClose: closeB });
    await flush();
    expect(main.style.overflow).toBe('hidden');

    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(closeB).toHaveBeenCalledTimes(1);
    expect(closeA).not.toHaveBeenCalled();

    b.component.$set({ open: false });
    await flush();
    expect(main.style.overflow).toBe('hidden');
    a.component.$set({ open: false });
    await flush();
    expect(main.style.overflow).not.toBe('hidden');
  });
});
