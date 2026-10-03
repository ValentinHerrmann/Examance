// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { get } from 'svelte/store';
import {
  applyTheme,
  resolveTheme,
  setThemePreference,
  themePreference,
  THEME_STORAGE_KEY,
} from '../src/lib/stores/theme';

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    setThemePreference('system');
  });

  it('resolves system against the OS, explicit choices win', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('persists an explicit preference and removes the key for system', () => {
    setThemePreference('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(get(themePreference)).toBe('dark');
    setThemePreference('system');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(get(themePreference)).toBe('system');
  });

  it('applyTheme sets data-theme on the root', () => {
    const root = document.createElement('div');
    applyTheme('dark', root);
    expect(root.dataset.theme).toBe('dark');
    applyTheme('light', root);
    expect(root.dataset.theme).toBe('light');
  });
});
