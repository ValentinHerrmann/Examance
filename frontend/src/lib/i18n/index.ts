import { derived, get, writable } from 'svelte/store';
import { safeLocalStorage } from '$lib/utils/storage';
import { de } from './de';
import { en } from './en';
import type { Locale, TranslationKey, TranslationVars, Translations } from './types';

export type { Locale, TranslationKey, TranslationVars, Translations };

const STORAGE_KEY = 'bg_locale';

export const LOCALES: readonly Locale[] = ['de', 'en'];

/** Native language names, deliberately not translated. */
export const LOCALE_LABELS: Record<Locale, string> = {
    de: 'Deutsch',
    en: 'English',
};

const catalogs: Record<Locale, Translations> = { de, en };

function isLocale(value: unknown): value is Locale {
    return value === 'de' || value === 'en';
}

/**
 * Saved choice wins; otherwise follow the browser. Read synchronously at
 * module init so the very first paint is already in the right language.
 */
export function detectLocale(): Locale {
    const saved = safeLocalStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
    try {
        if (navigator.language?.toLowerCase().startsWith('de')) return 'de';
    } catch {
        // No navigator (SSR, worker) — fall through to the default.
    }
    return 'en';
}

function resolve(catalog: Translations, key: string): string | undefined {
    let node: unknown = catalog;
    for (const segment of key.split('.')) {
        if (typeof node !== 'object' || node === null) return undefined;
        node = (node as Record<string, unknown>)[segment];
    }
    return typeof node === 'string' ? node : undefined;
}

function interpolate(template: string, vars?: TranslationVars): string {
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => {
        if (!(name in vars)) return match;
        const value = vars[name];
        return value === null || value === undefined ? '' : String(value);
    });
}

/**
 * Falls back to German and then to the key itself: a missing translation
 * degrades to readable text instead of an empty label or a crash.
 */
function lookup(activeLocale: Locale, key: string, vars?: TranslationVars): string {
    const template = resolve(catalogs[activeLocale], key) ?? resolve(de, key) ?? key;
    return interpolate(template, vars);
}

export const locale = writable<Locale>(detectLocale());

export function setLocale(next: Locale): void {
    safeLocalStorage.setItem(STORAGE_KEY, next);
    locale.set(next);
}

/** Flip between the two supported languages. */
export function toggleLocale(): void {
    setLocale(get(locale) === 'de' ? 'en' : 'de');
}

/** Reactive translator for markup: `{$t('common.cancel')}`. */
export const t = derived(
    locale,
    ($locale) =>
        (key: TranslationKey, vars?: TranslationVars): string =>
            lookup($locale, key, vars)
);

/**
 * Reactive counterpart of `translateOptional` for markup: yields `undefined`
 * when the runtime key has no catalog entry.
 */
export const tOptional = derived(
    locale,
    ($locale) =>
        (key: string, vars?: TranslationVars): string | undefined => {
            const template = resolve(catalogs[$locale], key) ?? resolve(de, key);
            return template === undefined ? undefined : interpolate(template, vars);
        }
);

/** Imperative translator for plain modules, `alert()` and event handlers. */
export function translate(key: TranslationKey, vars?: TranslationVars): string {
    return lookup(get(locale), key, vars);
}

/**
 * Translate a key that is only known at runtime (e.g. a backend error code),
 * returning `undefined` when no catalog entry exists so the caller can fall
 * back to the server-supplied text.
 */
export function translateOptional(key: string, vars?: TranslationVars): string | undefined {
    const template = resolve(catalogs[get(locale)], key) ?? resolve(de, key);
    return template === undefined ? undefined : interpolate(template, vars);
}
