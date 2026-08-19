import { derived, get } from 'svelte/store';
import { locale } from '$lib/i18n';
import type { Locale } from '$lib/i18n';

/**
 * BCP 47 tags for `Intl`. Decimal comma vs. point and dd.MM.yyyy vs. dd/MM/yyyy
 * both matter in a grading app, so the UI locale drives them explicitly instead
 * of falling back to the browser default.
 */
const INTL_LOCALE: Record<Locale, string> = {
    de: 'de-DE',
    en: 'en-GB',
};

export function intlLocale(activeLocale: Locale = get(locale)): string {
    return INTL_LOCALE[activeLocale];
}

function toDate(value: Date | string | number): Date | null {
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** Date only, e.g. `19.08.2026` / `19/08/2026`. Empty string for unparsable input. */
export function formatDate(value: Date | string | number, activeLocale: Locale = get(locale)): string {
    const date = toDate(value);
    return date ? date.toLocaleDateString(intlLocale(activeLocale)) : '';
}

/** Date and time, e.g. `19.08.2026, 14:03`. */
export function formatDateTime(value: Date | string | number, activeLocale: Locale = get(locale)): string {
    const date = toDate(value);
    return date ? date.toLocaleString(intlLocale(activeLocale)) : '';
}

/** Number with locale-correct decimal separator. */
export function formatNumber(
    value: number,
    options: Intl.NumberFormatOptions = {},
    activeLocale: Locale = get(locale)
): string {
    if (!Number.isFinite(value)) return '';
    return new Intl.NumberFormat(intlLocale(activeLocale), options).format(value);
}

/** Percentage, e.g. `62,5 %` / `62.5%`. */
export function formatPercent(
    value: number,
    fractionDigits = 1,
    activeLocale: Locale = get(locale)
): string {
    if (!Number.isFinite(value)) return '';
    return new Intl.NumberFormat(intlLocale(activeLocale), {
        style: 'percent',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    }).format(value);
}

/**
 * Reactive formatters for markup: `{$fmt.date(exam.createdAt)}` re-renders when
 * the language is switched.
 */
export const fmt = derived(locale, ($locale) => ({
    date: (value: Date | string | number) => formatDate(value, $locale),
    dateTime: (value: Date | string | number) => formatDateTime(value, $locale),
    number: (value: number, options?: Intl.NumberFormatOptions) => formatNumber(value, options, $locale),
    percent: (value: number, fractionDigits?: number) => formatPercent(value, fractionDigits, $locale),
}));
