import { compareText } from './listSort';
import { parseDecimal } from '#lib/utils/parseDecimal';

/** Format concatenated grade (school year) and course/klasse letter. e.g. grade="10", klasse="a" -> "10a" */
export function formatExamCourse(grade?: string | null, klasse?: string | null): string {
  const g = (grade || '').trim();
  const k = (klasse || '').trim();
  if (g && k) {
    if (k.toLowerCase().startsWith(g.toLowerCase())) {
      return k;
    }
    return `${g}${k}`;
  }
  return g || k || '';
}

/** The printed course (`\Klasse`): the exam's own `course` when set, else grade + klasse. The only course builder. */
export function examCourse(exam: { grade?: string | null; klasse?: string | null; course?: string | null }): string {
  return exam.course?.trim() || formatExamCourse(exam.grade, exam.klasse);
}

/** The generated exam title "Kurzarbeit 1 · Informatik 10a · 05.11.2026" (issue #212); empty parts are skipped, `fallback` when all are empty. The only title builder. */
export function generatedExamTitle(
  exam: { testart?: string | null; nr?: string | null; fach?: string | null; grade?: string | null; klasse?: string | null; course?: string | null; datum?: string | null },
  fallback: string,
): string {
  const join = (...parts: (string | null | undefined)[]) => parts.map((p) => (p ?? '').trim()).filter(Boolean).join(' ');
  const title = [join(exam.testart, exam.nr), join(exam.fach, examCourse(exam)), parseDatumAndDauer(exam.datum).datumDate]
    .filter(Boolean)
    .join(' · ');
  return title || fallback;
}

/** Distinct exercise topics as exam-topic suggestions; "_General" is the editor's default, not a topic. */
export function exerciseTopicSuggestions(exercises: { topicTag?: string | null }[]): string[] {
  const topics = exercises.map((e) => e.topicTag?.trim()).filter((t): t is string => !!t && t !== '_General');
  return [...new Set(topics)].sort(compareText);
}

/** Legacy reader (the working time is `durationMinutes` since issue #265): splits a combined date/duration string into datumDate and dauer. e.g. "20.05.2025 (30 Min)" -> { datumDate: "20.05.2025", dauer: "30 Min" } e.g. "20.05.2025" -> { datumDate: "20.05.2025", dauer: "" } */
export function parseDatumAndDauer(raw?: string | null): { datumDate: string; dauer: string } {
  if (!raw) return { datumDate: '', dauer: '' };
  const str = raw.trim();
  // Split at the first "(" that leaves a trailing "(…)" and no line break inside either part (the former `.`-based regex, in linear time).
  const breaks = [...str.matchAll(/[\n\r\u2028\u2029]/g)].map((m) => m.index);
  const open = str.indexOf('(', (breaks.at(-1) ?? -1) + 1);
  if (!str.endsWith(')') || open < 0 || open > str.length - 2) return { datumDate: str, dauer: '' };
  let dateEnd = open;
  while (dateEnd > 0 && /\s/.test(str[dateEnd - 1])) dateEnd--;
  if (breaks.length && breaks[0] < dateEnd) return { datumDate: str, dauer: '' };
  return { datumDate: str.slice(0, dateEnd).trim(), dauer: str.slice(open + 1, -1).trim() };
}

/** Whole minutes of a legacy duration text ("30 Min", "1,5 Std", "2 h"); null when it is not a whole number of minutes (mirrors `split_legacy_datum` in migration 0067). */
export function parseDurationMinutes(text?: string | null): number | null {
  const match = /^(\d+(?:[.,]\d+)?)\s*([a-z.]*)$/i.exec((text ?? '').trim());
  if (!match) return null;
  const unit = match[2].toLowerCase();
  const factor = MINUTE_UNITS.has(unit) ? 1 : HOUR_UNITS.has(unit) ? 60 : null;
  if (factor === null) return null;
  const minutes = (parseDecimal(match[1]) ?? Number.NaN) * factor;
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440 ? minutes : null;
}

const MINUTE_UNITS = new Set(['', 'min', 'min.', 'minute', 'minuten', 'minutes']);
const HOUR_UNITS = new Set(['std', 'std.', 'stunde', 'stunden', 'h', 'hour', 'hours']);

/** An old "date (duration)" value as date and whole minutes (issue #265); an unreadable bracket stays in the date, so nothing is lost. Imports of old archives go through it. */
export function splitLegacyDatum(raw?: string | null): { datum: string; durationMinutes: number | null } {
  const { datumDate, dauer } = parseDatumAndDauer(raw);
  const durationMinutes = parseDurationMinutes(dauer);
  return durationMinutes === null ? { datum: (raw ?? '').trim(), durationMinutes } : { datum: datumDate, durationMinutes };
}

/** The printed `\Datum`: "date (45 Minuten + 5 Minuten Einlesezeit)" from the date, the working time and the reading time; without either the stored text as it is (legacy brackets print as before); the minutes replace an old duration text, never another bracket. The only builder. */
export function printedDatum(exam: { datum?: string | null; durationMinutes?: number | null; readingMinutes?: number | null }): string {
  const reading = exam.readingMinutes ? `${exam.readingMinutes} Minuten Einlesezeit` : '';
  if (!exam.durationMinutes) return reading ? `${(exam.datum ?? '').trim()} (${reading})`.trim() : (exam.datum ?? '').trim();
  const times = [`${exam.durationMinutes} Minuten`, reading].filter(Boolean).join(' + ');
  return `${legacyDuration(exam.datum).date} (${times})`.trim();
}

/** The date and an old duration text the minutes replace: a trailing bracket counts as a duration only when it holds a number ("2 Schulstunden"); a note such as "(Nachtermin)" stays part of the date. */
export function legacyDuration(raw?: string | null): { date: string; text: string } {
  const { datumDate, dauer } = parseDatumAndDauer(raw);
  return /\d/.test(dauer) ? { date: datumDate, text: dauer } : { date: (raw ?? '').trim(), text: '' };
}
