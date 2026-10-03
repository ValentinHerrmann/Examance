import { derived, writable, type Readable } from 'svelte/store';
import { safeLocalStorage } from '$lib/utils/storage';
import { mediaQuery } from '$lib/stores/viewport';

/**
 * Colour theme. The preference is what the user picked; `theme` is what is
 * actually rendered once `system` has been resolved against the OS.
 *
 * `app.html` runs a tiny inline script that applies the same resolution before
 * the first paint (no white flash on a dark system). It reads the same storage
 * key, so keep THEME_STORAGE_KEY and that script in sync.
 */
export type ThemePreference = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'bg_theme';
export const THEME_PREFERENCES: readonly ThemePreference[] = ['system', 'light', 'dark'];

function isPreference(value: unknown): value is ThemePreference {
    return value === 'system' || value === 'light' || value === 'dark';
}

export function readThemePreference(): ThemePreference {
    const saved = safeLocalStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(saved) ? saved : 'system';
}

export const themePreference = writable<ThemePreference>(readThemePreference());

export function setThemePreference(next: ThemePreference): void {
    if (next === 'system') {
        safeLocalStorage.removeItem(THEME_STORAGE_KEY);
    } else {
        safeLocalStorage.setItem(THEME_STORAGE_KEY, next);
    }
    themePreference.set(next);
}

/** Pure resolution, shared with the tests. */
export function resolveTheme(preference: ThemePreference, systemDark: boolean): Theme {
    if (preference === 'system') return systemDark ? 'dark' : 'light';
    return preference;
}

export const systemPrefersDark = mediaQuery('(prefers-color-scheme: dark)', false);

export const theme: Readable<Theme> = derived(
    [themePreference, systemPrefersDark],
    ([$preference, $systemDark]) => resolveTheme($preference, $systemDark)
);

/** Writes the resolved theme onto <html>; the CSS tokens key off it. */
export function applyTheme(next: Theme, root: HTMLElement = document.documentElement): void {
    if (root.dataset.theme !== next) {
        root.dataset.theme = next;
    }
}
