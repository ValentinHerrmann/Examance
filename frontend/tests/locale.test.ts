import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import {
  locale,
  setLocale,
  toggleLocale,
  detectLocale,
  translate,
  translateOptional,
  t,
  LOCALES,
  LOCALE_LABELS,
} from '../src/lib/i18n';
import { de } from '../src/lib/i18n/de';
import { en } from '../src/lib/i18n/en';

// Mock localStorage for the Vitest environment, matching tests/storagePolicy.test.ts.
const mockStorage: Record<string, string> = {};
globalThis.localStorage = {
  getItem: (key: string) => mockStorage[key] ?? null,
  setItem: (key: string, val: string) => { mockStorage[key] = val; },
  removeItem: (key: string) => { delete mockStorage[key]; },
  clear: () => {
    for (const k of Object.keys(mockStorage)) {
      delete mockStorage[k];
    }
  },
  length: 0,
  key: () => null,
};

function setNavigatorLanguage(value: string | undefined) {
  if (value === undefined) {
    // Simulate an environment with no navigator at all (SSR, worker).
    // @ts-expect-error deliberately removing the global for this test
    delete globalThis.navigator;
    return;
  }
  Object.defineProperty(globalThis, 'navigator', {
    value: { language: value },
    configurable: true,
    writable: true,
  });
}

const originalNavigator = globalThis.navigator;

describe('locale detection', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    });
  });

  it('honours a saved choice over the browser language', () => {
    localStorage.setItem('bg_locale', 'en');
    setNavigatorLanguage('de-DE');
    expect(detectLocale()).toBe('en');
  });

  it('falls back to the browser language when nothing is saved', () => {
    setNavigatorLanguage('de-AT');
    expect(detectLocale()).toBe('de');
  });

  it('is case-insensitive about the browser language tag', () => {
    setNavigatorLanguage('DE-CH');
    expect(detectLocale()).toBe('de');
  });

  it('defaults to English for a non-German browser language', () => {
    setNavigatorLanguage('fr-FR');
    expect(detectLocale()).toBe('en');
  });

  it('defaults to English when there is no navigator', () => {
    setNavigatorLanguage(undefined);
    expect(detectLocale()).toBe('en');
  });

  it('ignores a garbage value in localStorage', () => {
    localStorage.setItem('bg_locale', 'klingon');
    setNavigatorLanguage('fr-FR');
    expect(detectLocale()).toBe('en');
  });
});

describe('locale store', () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale('de');
  });

  it('persists the selection', () => {
    setLocale('en');
    expect(get(locale)).toBe('en');
    expect(localStorage.getItem('bg_locale')).toBe('en');
  });

  it('toggles between the two supported languages', () => {
    toggleLocale();
    expect(get(locale)).toBe('en');
    toggleLocale();
    expect(get(locale)).toBe('de');
  });

  it('exposes a native label for every supported locale', () => {
    for (const code of LOCALES) {
      expect(LOCALE_LABELS[code]).toBeTruthy();
    }
  });
});

describe('translate', () => {
  beforeEach(() => {
    localStorage.clear();
    setLocale('de');
  });

  it('resolves a nested key in the active language', () => {
    expect(translate('common.cancel')).toBe(de.common.cancel);
    setLocale('en');
    expect(translate('common.cancel')).toBe(en.common.cancel);
  });

  it('interpolates named placeholders', () => {
    setLocale('en');
    expect(translate('settings.status.languageSet', { language: 'English' })).toContain('English');
  });

  it('leaves an unmatched placeholder untouched', () => {
    setLocale('en');
    expect(translate('settings.status.languageSet', {})).toContain('{language}');
  });

  it('renders a nullish interpolation value as an empty string', () => {
    setLocale('en');
    const rendered = translate('settings.status.languageSet', { language: undefined });
    expect(rendered).not.toContain('undefined');
    expect(rendered).not.toContain('{language}');
  });

  it('falls back to the key itself for an unknown key', () => {
    expect(translateOptional('nope.not.a.key')).toBeUndefined();
    // @ts-expect-error deliberately passing a key outside the catalog
    expect(translate('nope.not.a.key')).toBe('nope.not.a.key');
  });

  it('exposes the same lookup through the reactive store', () => {
    setLocale('en');
    expect(get(t)('common.save')).toBe(en.common.save);
  });
});

describe('catalog parity', () => {
  // The type system already enforces this, but a structural check catches a
  // catalog that type-checks only because of a stray `as any` or cast.
  function paths(node: unknown, prefix = ''): string[] {
    if (typeof node === 'string') return [prefix];
    if (typeof node !== 'object' || node === null) return [];
    return Object.entries(node).flatMap(([key, value]) =>
      paths(value, prefix ? `${prefix}.${key}` : key)
    );
  }

  it('German and English define exactly the same keys', () => {
    const dePaths = paths(de).sort();
    const enPaths = paths(en).sort();
    expect(enPaths).toEqual(dePaths);
  });

  it('has no empty translation values', () => {
    for (const catalog of [de, en]) {
      for (const path of paths(catalog)) {
        const value = path
          .split('.')
          .reduce<any>((node, segment) => node?.[segment], catalog);
        expect(value, `empty value at ${path}`).not.toBe('');
      }
    }
  });
});
