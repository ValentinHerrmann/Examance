import type { de } from './de';

/**
 * The shape of a complete translation catalog, derived from the German one.
 * German is the source of truth: adding a key there makes every other catalog
 * fail to type-check until it is translated too.
 *
 * `Widen` relaxes the `as const` string literals back to `string` — the German
 * catalog must pin the key *structure*, not the actual German wording.
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
 * Values interpolated into `{placeholder}` slots.
 *
 * Nullish is allowed and renders as an empty string: interpolated values are
 * very often optional record fields (an exercise without a title, an exam
 * without a subject), and a blank slot is the right UI for that. Where a
 * visible placeholder reads better, pass an explicit fallback at the call site
 * — e.g. `{ title: exercise.title ?? $t('exercises.untitled') }`.
 */
export type TranslationVars = Record<string, string | number | null | undefined>;

export type Locale = 'de' | 'en';
