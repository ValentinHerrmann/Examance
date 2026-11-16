/** The exam's working time, reading time and time extensions for the room timer Examtimer (issue #265, docs/dev/time_extensions.md): the JSON import file, and the readable link format v1 whose data sits in the URL fragment (never sent to a server). */
import type { ExamRecord, StudentRecord } from '#lib/db/schema';
import { examBaseMinutes, extensionLabel, extensionMinutes } from '#lib/students/timeExtension';
import { examCourse } from '#lib/utils/examLabel';
import { safeLocalStorage } from '#lib/utils/storage';
import { givenName } from '#lib/utils/studentQr';

export const TIMER_FORMAT = 'examtimer-import';
export const TIMER_FORMAT_VERSION = 1;
export const DEFAULT_TIMER_URL = 'https://examtimer.valentin-herrmann.com/';
const TIMER_URL_KEY = 'bg_examtimer_url';

/** One entry of Examtimer's `extensions` list, always in minutes (see `buildTimerData`). */
export interface TimerExtension {
  value: number;
  unit: 'min';
  label: string;
}

export interface TimerData {
  format: typeof TIMER_FORMAT;
  version: typeof TIMER_FORMAT_VERSION;
  /** Keys of Examtimer's settings object; whatever is absent keeps its value there. */
  settings: { course: string; subject: string; exam: string; duration: string; readingTime: string; extensions: TimerExtension[] };
}

/** Examtimer's subjects, exact spelling; it shows anything else as "Sonstige". */
export const EXAMTIMER_SUBJECTS = [
  'Informatik', 'Mathematik', 'Physik', 'Biologie', 'Chemie', 'Deutsch', 'Englisch', 'Latein', 'Französisch', 'Geographie', 'Geschichte',
  'PuG', 'WuR', 'Ev. Religion', 'Kat. Religion', 'Ethik', 'Kunst', 'Musik', 'Sport', 'Nachschrift', 'Sonstige',
] as const;
export const MAX_TIMER_EXTENSIONS = 20;
const MAX_LABEL = 60;

/** The exam's subject in Examtimer's spelling (ignoring case and surrounding spaces), else "Sonstige", so the timer never keeps the previous exam's subject. */
export function timerSubject(fach?: string | null): string {
  const wanted = (fach ?? '').trim().toLocaleLowerCase('de');
  return EXAMTIMER_SUBJECTS.find((name) => name.toLocaleLowerCase('de') === wanted) ?? 'Sonstige';
}

/** One entry per distinct extension in minutes, smallest first. A share becomes its minutes of working plus reading time, as printed on the paper (Examtimer would take it of the working time alone). A first name labels an entry only when asked for and only when exactly one student holds it: the timer is projected, and several names would clutter it. */
export function buildTimerData(exam: ExamRecord, students: readonly StudentRecord[], options: { names: boolean }): TimerData {
  const base = examBaseMinutes(exam);
  const groups = new Map<number, string[]>();
  for (const student of students) {
    const minutes = student.timeExtension ? extensionMinutes(student.timeExtension, base) : null;
    if (minutes === null) continue;
    groups.set(minutes, [...(groups.get(minutes) ?? []), givenName(student.studentName ?? '')]);
  }
  const extensions = [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .map(([value, names]) => ({ value, unit: 'min' as const, label: options.names && names.length === 1 ? names[0].slice(0, MAX_LABEL) : '' }));
  return {
    format: TIMER_FORMAT,
    version: TIMER_FORMAT_VERSION,
    settings: {
      course: examCourse(exam),
      subject: timerSubject(exam.fach),
      exam: [exam.testart, exam.nr].map((part) => part?.trim()).filter(Boolean).join(' ') || exam.title?.trim() || '',
      duration: String(exam.durationMinutes ?? ''),
      readingTime: String(exam.readingMinutes ?? 0),
      extensions,
    },
  };
}

/** The extensions as the dialog lists them: "+7,5 Min (Lena)". */
export function timerExtensionLabels(data: TimerData): string[] {
  return data.settings.extensions.map((ext) => extensionLabel(ext) + (ext.label ? ` (${ext.label})` : ''));
}

/** Why the link cannot be opened, or null: Examtimer refuses a link without a working time or with more than 20 extensions. The file stays available. */
export function timerLinkProblem(data: TimerData): 'noDuration' | 'tooMany' | null {
  if (!data.settings.duration) return 'noDuration';
  return data.settings.extensions.length > MAX_TIMER_EXTENSIONS ? 'tooMany' : null;
}

export function timerFile(data: TimerData): Blob {
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

/** A value as Examtimer's link format v1 encodes it: `encodeURIComponent`, a space as `+`, `:` literal. */
const encodeValue = (value: string): string => encodeURIComponent(value).replaceAll('%20', '+').replace(/%3A/gi, ':');
/** At most two decimals, with a point. */
const linkNumber = (value: number): string => String(Math.round(value * 100) / 100);

/** Examtimer's control page with the settings in the fragment, link format v1: `<base>control#v=1&course=10a&exam=…&subject=…&duration=45&readingTime=5&ext=10min&ext=7.5min:Lena`. An empty `ext=` clears the timer's extensions; the hosted page has no .html. */
export function timerLink(base: string, data: TimerData): string {
  const url = new URL('control', base.endsWith('/') ? base : `${base}/`);
  const { course, exam, subject, duration, readingTime, extensions } = data.settings;
  const parts = ['v=1'];
  for (const [name, value] of [['course', course], ['exam', exam], ['subject', subject], ['duration', duration], ['readingTime', readingTime]] as const) {
    if (value) parts.push(`${name}=${encodeValue(value)}`);
  }
  if (!extensions.length) parts.push('ext=');
  for (const ext of extensions) parts.push(`ext=${encodeValue(`${linkNumber(ext.value)}min${ext.label ? `:${ext.label}` : ''}`)}`);
  url.hash = parts.join('&');
  return url.toString();
}

/** A usable Examtimer address (https, or http on this computer), normalised; null otherwise. */
export function validTimerUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    return url.protocol === 'https:' || (url.protocol === 'http:' && local) ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The teacher's Examtimer address, kept in this browser like the other display preferences; the default until one is set. */
export function timerUrl(): string {
  return validTimerUrl(safeLocalStorage.getItem(TIMER_URL_KEY) ?? '') ?? DEFAULT_TIMER_URL;
}

/** Saves the address; empty or the default clears the stored value. Returns false for an unusable address (nothing is saved). */
export function setTimerUrl(value: string): boolean {
  if (!value.trim()) {
    safeLocalStorage.removeItem(TIMER_URL_KEY);
    return true;
  }
  const url = validTimerUrl(value);
  if (!url) return false;
  if (url === DEFAULT_TIMER_URL) safeLocalStorage.removeItem(TIMER_URL_KEY);
  else safeLocalStorage.setItem(TIMER_URL_KEY, url);
  return true;
}
