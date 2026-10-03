import type { de } from './de';

/**
 * Shape of a complete catalog, derived from the German one: a key added there fails every other
 * catalog's type-check until translated. `Widen` relaxes `as const` literals to `string` so
 * German pins the key structure, not its wording.
 */
export type Translations = Widen<typeof de>;

type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> };

/**
 * Every valid dotted path into a catalog, e.g. `'common.cancel'`.
 * Typos and stale keys become compile errors instead of runtime blanks.
 */
export type TranslationKey = Leaves<Translations>;

type Leaves<T> = {
    [K in keyof T & string]: T[K] extends string ? K : `${K}.${Leaves<T[K]>}`;
}[keyof T & string];

/**
 * Values interpolated into `{placeholder}` slots. Nullish renders as an empty string, right for
 * optional record fields; pass an explicit fallback at the call site where a visible
 * placeholder reads better.
 */
export type TranslationVars = Record<string, string | number | null | undefined>;

export type Locale = 'de' | 'en';
