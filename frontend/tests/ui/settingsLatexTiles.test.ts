// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { tick } from 'svelte';

const { default: SettingsForm } = await import('../../src/lib/components/settings/SettingsForm.svelte');

afterEach(() => cleanup());

// Regression: the LaTeX tiles cancelled the native click, so the browser put the old radio back after the setting had changed.
describe('SettingsForm LaTeX tiles', () => {
  it('keeps the dot on the engine just chosen', async () => {
    const props = { part: 'latex' as const, storageMode: null, allowedModes: [], serverLatexEnabled: true, latexCompilation: 'server' as 'server' | 'local' };
    const view = render(SettingsForm, {
      ...props,
      onLatexChange: (val: 'server' | 'local') => void view.rerender({ ...props, latexCompilation: val }),
    });
    const local = view.container.querySelector<HTMLInputElement>('input[name="latexCompilation"][value="local"]')!;
    await fireEvent.click(local);
    await tick();
    expect(local.checked).toBe(true);
    expect(view.container.querySelector<HTMLInputElement>('input[value="server"]')!.checked).toBe(false);
  });
});
