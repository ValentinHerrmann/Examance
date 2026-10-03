// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { lockScroll, scrollLockCount } from '../src/lib/utils/scrollLock';

describe('scrollLock', () => {
  let main: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = '<div class="app-main" style="overflow: auto"></div>';
    main = document.querySelector('.app-main') as HTMLElement;
  });

  it('locks on first take and restores styles on last release', () => {
    const a = lockScroll();
    expect(main.style.overflow).toBe('hidden');
    expect(main.hasAttribute('data-scroll-locked')).toBe(true);
    a();
    expect(main.style.overflow).toBe('auto');
    expect(main.hasAttribute('data-scroll-locked')).toBe(false);
    expect(scrollLockCount()).toBe(0);
  });

  it('ref-counts stacked locks', () => {
    const a = lockScroll();
    const b = lockScroll();
    expect(scrollLockCount()).toBe(2);
    b();
    expect(main.style.overflow).toBe('hidden');
    a();
    expect(main.style.overflow).toBe('auto');
  });

  it('ignores a double release', () => {
    const a = lockScroll();
    const b = lockScroll();
    a();
    a();
    expect(scrollLockCount()).toBe(1);
    expect(main.style.overflow).toBe('hidden');
    b();
    expect(scrollLockCount()).toBe(0);
  });
});
