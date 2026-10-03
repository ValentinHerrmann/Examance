// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import Button from '../../src/lib/components/ui/Button.svelte';

afterEach(cleanup);

describe('Button', () => {
  it('renders a button and fires onClick', async () => {
    const onClick = vi.fn();
    const { container } = render(Button, { onClick });
    const el = container.querySelector('button')!;
    await fireEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders an anchor with href', () => {
    const { container } = render(Button, { href: '/x' });
    const a = container.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('/x');
    expect(container.querySelector('button')).toBeNull();
  });

  it('disabled anchor: aria-disabled, no href, click ignored', async () => {
    const onClick = vi.fn();
    const { container } = render(Button, { href: '/x', disabled: true, onClick });
    const a = container.querySelector('a')!;
    expect(a.getAttribute('aria-disabled')).toBe('true');
    expect(a.hasAttribute('href')).toBe(false);
    await fireEvent.click(a);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('loading sets aria-busy and disables', async () => {
    const onClick = vi.fn();
    const { container } = render(Button, { loading: true, onClick });
    const el = container.querySelector('button')!;
    expect(el.getAttribute('aria-busy')).toBe('true');
    expect(el.disabled).toBe(true);
    await fireEvent.click(el);
    expect(onClick).not.toHaveBeenCalled();
  });
});
