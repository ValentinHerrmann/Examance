/**
 * Catalog-driven text matching for the e2e suite.
 *
 * Specs never hard-code UI strings that exist in the i18n catalogs. They ask
 * for a catalog key and get back a text or a RegExp that is:
 *
 *  - taken from the real catalog (`src/lib/i18n/{en,de}`), so a reworded label
 *    changes tests and app together;
 *  - stripped of emoji and decorative glyphs (arrows, check marks, `+`, list
 *    numbering, the required-field `*`), because those are exactly the parts of
 *    a label that a visual redesign turns into icons;
 *  - matched as a case-insensitive SUBSTRING, never as an exact accessible name.
 *
 * `{placeholders}` in a template are substituted from `vars` when supplied and
 * otherwise become a wildcard, so `label('exam.nav.tabs.scan')` matches
 * "2. Scan Ingestion (0)" as well as "Scan Ingestion (12)".
 */
import { de } from '../../src/lib/i18n/de';
import { en } from '../../src/lib/i18n/en';

export type Locale = 'en' | 'de';
export type Vars = Record<string, string | number>;

const catalogs: Record<Locale, unknown> = { en, de };

/** The locale the whole suite pins the app to unless a test switches it. */
export const DEFAULT_LOCALE: Locale = 'en';

/**
 * Walk a dotted key through a catalog. Throws on a missing key so a typo in a
 * spec fails loudly instead of silently matching an empty string.
 */
export function rawTemplate(key: string, locale: Locale = DEFAULT_LOCALE): string {
  let node: unknown = catalogs[locale];
  for (const segment of key.split('.')) {
    if (typeof node !== 'object' || node === null) {
      throw new Error(`i18n key "${key}" not found in "${locale}" catalog (stopped at "${segment}")`);
    }
    node = (node as Record<string, unknown>)[segment];
  }
  if (typeof node !== 'string') {
    throw new Error(`i18n key "${key}" in "${locale}" catalog is not a string`);
  }
  return node;
}

/**
 * Remove emoji, arrows, check marks and other decorative glyphs, then collapse
 * whitespace. Order matters: glyphs go first so the numbering/`+`/`*` rules see
 * the text that is really left.
 */
export function stripDecoration(text: string): string {
  return (
    text
      // Emoji (incl. keycaps' pictographs), variation selectors, joiners, tags.
      .replace(/\p{Extended_Pictographic}/gu, ' ')
      .replace(/[‍︎️⃣]/g, '')
      // Arrows, check/cross marks, dingbats, geometric shapes, "multiply".
      .replace(/[←-⇿✀-➿■-◿☀-⛿×›‹»«•·]/g, ' ')
      // Leading list numbering such as "1. " or "3) ", used by wizard-like labels.
      .replace(/^\s*\d+[.)]\s+/, '')
      // A leading "+" ("+ Add option") is an icon after a redesign.
      .replace(/^\s*\+\s*/, '')
      // Required-field marker ("Name *").
      .replace(/\s*\*\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
  );
}

/** Escape a string for literal use inside a RegExp. */
export function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Fill a template's `{name}` placeholders from `vars`. Placeholders without a
 * value are left in place (the caller turns them into wildcards).
 */
function substitute(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match,
  );
}

/** The decoration-free text of a catalog entry with `vars` substituted. */
export function text(key: string, vars?: Vars, locale: Locale = DEFAULT_LOCALE): string {
  return stripDecoration(substitute(rawTemplate(key, locale), vars));
}

/**
 * A case-insensitive substring RegExp for a catalog entry. Unresolved
 * `{placeholders}` match any run of characters; literal whitespace is matched
 * flexibly (newlines and repeated spaces in the DOM).
 */
export function label(key: string, vars?: Vars, locale: Locale = DEFAULT_LOCALE): RegExp {
  const cleaned = stripDecoration(substitute(rawTemplate(key, locale), vars));
  const pieces = cleaned.split(/\{\w+\}/);
  const pattern = pieces
    .map((piece) => escapeRegExp(piece.trim()).replace(/\s+/g, '\\s+'))
    .join('.*?');
  return new RegExp(pattern, 'i');
}

/**
 * Like `label` but anchored: the whole accessible name must be the label, give
 * or take non-word characters at either end (icons, emoji, `*`, `:`), and
 * case-insensitive. Use it only where a bare substring is ambiguous, e.g.
 * "Delete" vs "Delete Submissions".
 */
export function labelExact(key: string, vars?: Vars, locale: Locale = DEFAULT_LOCALE): RegExp {
  const cleaned = stripDecoration(substitute(rawTemplate(key, locale), vars));
  const pieces = cleaned.split(/\{\w+\}/);
  const pattern = pieces
    .map((piece) => escapeRegExp(piece.trim()).replace(/\s+/g, '\\s+'))
    .join('.*?');
  return new RegExp(`^\\W*${pattern}\\W*$`, 'i');
}

/**
 * The "stem" of a label: the text before the first `{placeholder}` or opening
 * parenthesis. "2. Scan Ingestion ({count})" becomes /Scan Ingestion/i. Use it
 * where a counter that is rendered as "(3)" today may become a badge later.
 */
export function stem(key: string, locale: Locale = DEFAULT_LOCALE): RegExp {
  const cleaned = stripDecoration(rawTemplate(key, locale));
  const head = cleaned.split(/\s*[({]/)[0].trim();
  return new RegExp(escapeRegExp(head).replace(/\s+/g, '\\s+'), 'i');
}

/**
 * Native language names. They live in `lib/i18n/index.ts` (`LOCALE_LABELS`),
 * which cannot be imported here because it uses the `$lib` alias, and they are
 * deliberately not translated, so repeating them is safe.
 */
export const LOCALE_NATIVE_NAMES: Record<Locale, string> = { de: 'Deutsch', en: 'English' };

/** A RegExp for text that is not a catalog entry (user-entered data). */
export function literal(value: string): RegExp {
  return new RegExp(escapeRegExp(value), 'i');
}
