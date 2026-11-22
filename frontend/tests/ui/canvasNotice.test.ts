// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import { tick } from 'svelte';
import CanvasNotice from '../../src/lib/components/grading/CanvasNotice.svelte';

afterEach(() => cleanup());

describe('CanvasNotice', () => {
  // Regression: the action ran after hide() cleared the notice, so "Resume now" never ended the cool-off.
  it('runs the action and hides the notice', async () => {
    const onClick = vi.fn();
    const { component } = render(CanvasNotice);
    component.show({ message: 'Paused', action: { label: 'Resume now', onClick }, timeoutMs: 30_000, progress: true });
    await tick();
    await fireEvent.click(screen.getByRole('button', { name: 'Resume now' }));
    await tick();
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.queryByText('Paused')).toBeNull();
  });
});
