/** The exam's working time and time extensions for the room timer Examtimer (issue #265, docs/dev/time_extensions.md): one import format, as a file and as a link whose data sits in the URL fragment (never sent to a server). */
import type { ExamRecord, StudentRecord } from '#lib/db/schema';
import { extensionLabel, type ExtensionUnit } from '#lib/students/timeExtension';
import { examCourse } from '#lib/utils/examLabel';
import { safeLocalStorage } from '#lib/utils/storage';
import { givenName } from '#lib/utils/studentQr';

export const TIMER_FORMAT = 'examtimer-import';
export const TIMER_FORMAT_VERSION = 1;
export const DEFAULT_TIMER_URL = 'https://examtimer.valentin-herrmann.com/';
const TIMER_URL_KEY = 'bg_examtimer_url';

/** One entry of Examtimer's `extensions` list. */
export interface TimerExtension {
  value: number;
  unit: ExtensionUnit;
  label: string;
}

export interface TimerData {
  format: typeof TIMER_FORMAT;
  version: typeof TIMER_FORMAT_VERSION;
  /** Keys of Examtimer's settings object; whatever is absent keeps its value there. */
  settings: { course: string; subject: string; exam: string; duration: string; extensions: TimerExtension[] };
}

/** One entry per distinct extension, smallest first within minutes and shares. A first name labels an entry only when asked for and only when exactly one student holds it: the timer is projected, and several names would clutter it. */
export function buildTimerData(exam: ExamRecord, students: readonly StudentRecord[], options: { names: boolean }): TimerData {
  const groups = new Map<string, { value: number; unit: ExtensionUnit; names: string[] }>();
  for (const student of students) {
    const ext = student.timeExtension;
    if (!ext) continue;
    const key = `${ext.unit}:${ext.value}`;
    const group = groups.get(key) ?? { ...ext, names: [] };
    group.names.push(givenName(student.studentName ?? ''));
    groups.set(key, group);
  }
  const extensions = [...groups.values()]
    .sort((a, b) => Number(a.unit === '%') - Number(b.unit === '%') || a.value - b.value)
    .map(({ value, unit, names }) => ({ value, unit, label: options.names && names.length === 1 ? names[0] : '' }));
  return {
    format: TIMER_FORMAT,
    version: TIMER_FORMAT_VERSION,
    settings: {
      course: examCourse(exam),
      subject: exam.fach?.trim() ?? '',
      exam: [exam.testart, exam.nr].map((part) => part?.trim()).filter(Boolean).join(' ') || exam.title?.trim() || '',
      duration: String(exam.durationMinutes ?? ''),
      extensions,
    },
  };
}

/** The extensions as the dialog lists them: "+25 % (Lena)". */
export function timerExtensionLabels(data: TimerData): string[] {
  return data.settings.extensions.map((ext) => extensionLabel(ext) + (ext.label ? ` (${ext.label})` : ''));
}

export function timerFile(data: TimerData): Blob {
  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

const toBase64Url = (text: string): string => {
  let binary = '';
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCodePoint(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

/** Reads a link's fragment back (tests, and the reference for Examtimer's importer). */
export function parseTimerFragment(fragment: string): TimerData {
  const encoded = fragment.replace(/^#?import=/, '').replaceAll('-', '+').replaceAll('_', '/');
  const bytes = Uint8Array.from(atob(encoded), (char) => char.codePointAt(0) ?? 0);
  return JSON.parse(new TextDecoder().decode(bytes)) as TimerData;
}

/** Examtimer's control page with the data in the fragment: `<base>control#import=<base64url JSON>` (the hosted page has no .html). */
export function timerLink(base: string, data: TimerData): string {
  const url = new URL('control', base.endsWith('/') ? base : `${base}/`);
  url.hash = `import=${toBase64Url(JSON.stringify(data))}`;
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
