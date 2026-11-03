/** Class lists from an LMS or a pasted list, and matching them to an exam's students (issue #209, docs/dev/result_sharing.md). Every source becomes `Contact[]`: stickers print from it, the e-mail channel saves addresses from it. */

import type { StudentRecord } from '#lib/db/schema';
import { parseRosterLines } from '#lib/utils/rosterLines';
import { artemisIdOf, formatStudentName, mebisIdOf, normalizeLmsId, stickerLmsId } from '#lib/utils/studentQr';

export interface Contact {
  /** As the source writes it: "Lastname, Firstname" or "Firstname Lastname". */
  name: string;
  /** Sticker id: the Mebis participant or Artemis user id, or a pasted one. */
  id: string | null;
  email: string | null;
  /** Where the id comes from: it is stored as the Mebis or Artemis id; a plain list's id only goes into the sticker. */
  source: ContactSource;
}

export type ContactSource = 'mebis' | 'artemis' | 'list';

/** One `@`, a dotted domain, no whitespace; checked without a regex, which would backtrack super-linearly on long input. */
export function isEmail(value: string | null | undefined): value is string {
  const text = (value ?? '').trim();
  const at = text.indexOf('@');
  if (at < 1 || at !== text.lastIndexOf('@') || /\s/.test(text)) return false;
  const domain = text.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  return dot > 0 && dot < domain.length - 1;
}

/** A pasted list, one student per line: the name, then optionally an id and an e-mail address, split on tab or `;` (so "Lastname, Firstname" stays whole); a cell with an `@` is the address. */
export function contactsFromLines(text: string): Contact[] {
  return parseRosterLines(text, /[\t;]/).flatMap(([name, ...rest]) => {
    if (!name) return [];
    const email = rest.find(isEmail) ?? null;
    const id = rest.find((cell) => cell && cell !== email) ?? null;
    return [{ name, id, email, source: 'list' as const }];
  });
}

/** One cell starting at *start*: its value, where the next cell starts, and whether a line ends after it. Quoted cells may hold separators, line breaks and doubled quotes. */
function readCell(text: string, start: number, sep: string): { value: string; next: number; lineEnd: boolean } {
  let value = '';
  let i = start;
  if (text[i] === '"') {
    i++;
    while (i < text.length && !(text[i] === '"' && text[i + 1] !== '"')) {
      value += text[i];
      i += text[i] === '"' ? 2 : 1;
    }
    i++;
  }
  while (i < text.length && text[i] !== sep && text[i] !== '\n' && text[i] !== '\r') value += text[i++];
  const lineEnd = i >= text.length || text[i] !== sep;
  const next = text[i] === '\r' && text[i + 1] === '\n' ? i + 2 : i + 1;
  return { value: value.trim(), next, lineEnd };
}

/** The cells of a CSV text: quoted fields with doubled quotes, `,` or `;` as separator (whichever the header line uses more). */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const header = clean.split(/\r?\n/, 1)[0] ?? '';
  const sep = (header.match(/;/g)?.length ?? 0) > (header.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const cell = readCell(clean, i, sep);
    row.push(cell.value);
    i = cell.next;
    if (cell.lineEnd) {
      if (row.some(Boolean)) rows.push(row);
      row = [];
    }
  }
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

const column = (header: string[], pattern: RegExp) => header.findIndex((h) => pattern.test(h.trim()));

/** A Mebis (Moodle) export: the assignment's grading worksheet ("Bewertungstabelle", ids like `Teilnehmer/in6028356`, as DiRueLei reads it) or a participant list with first and last name columns. Returns null when *text* is neither. */
export function contactsFromMebisCsv(text: string): Contact[] | null {
  const [header, ...rows] = parseCsv(text);
  if (!header) return null;
  const idCol = column(header, /^(id|identifier|kennung|teilnehmer\/?in|participant)$/i);
  const fullCol = column(header, /^(vollständiger name|full name|name)$/i);
  const firstCol = column(header, /^(vorname|first ?name)$/i);
  const lastCol = column(header, /^(nachname|last ?name|surname)$/i);
  const mailCol = column(header, /e-?mail/i);
  if (fullCol < 0 && (firstCol < 0 || lastCol < 0)) return null;
  return rows.flatMap((row) => {
    const name = fullCol >= 0 ? row[fullCol] : formatStudentName(`${row[lastCol] ?? ''}, ${row[firstCol] ?? ''}`);
    if (!name) return [];
    const email = mailCol >= 0 && isEmail(row[mailCol]) ? row[mailCol].trim() : null;
    return [{ name, id: idCol >= 0 ? normalizeLmsId(row[idCol]) : null, email, source: 'mebis' as const }];
  });
}

/** Order-free form of a name, so "Muster, Max" meets "Max Muster". */
export function nameKey(name: string | null | undefined): string {
  return (name ?? '')
    .toLocaleLowerCase('de')
    .normalize('NFC')
    .split(/[\s,]+/)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'de'))
    .join(' ');
}

export interface ContactMatch {
  student: StudentRecord;
  contact: Contact;
}

/** A student's id in the contact's source: Mebis and Artemis ids are compared only with their own kind; a plain list's id with the sticker's. */
export function studentIdFor(source: ContactSource, student: StudentRecord): string | null {
  if (source === 'mebis') return mebisIdOf(student);
  if (source === 'artemis') return artemisIdOf(student);
  return stickerLmsId(student);
}

/** Pairs students with contacts: by the id of the contact's source first, then by unambiguous name. */
export function matchContacts(
  students: readonly StudentRecord[],
  contacts: readonly Contact[]
): { matches: ContactMatch[]; unmatchedStudents: StudentRecord[]; unmatchedContacts: Contact[] } {
  const left = new Set(contacts);
  const idKey = (source: ContactSource, id: string) => `${source}:${normalizeLmsId(id) ?? id}`;
  const byId = new Map(contacts.flatMap((c) => (c.id ? [[idKey(c.source, c.id), c] as const] : [])));
  const matches: ContactMatch[] = [];
  const pending: StudentRecord[] = [];
  for (const student of students) {
    const contact = (['mebis', 'artemis', 'list'] as const)
      .map((source) => {
        const id = studentIdFor(source, student);
        return id ? byId.get(idKey(source, id)) : undefined;
      })
      .find((c) => c !== undefined && left.has(c));
    if (contact && left.has(contact)) {
      matches.push({ student, contact });
      left.delete(contact);
    } else pending.push(student);
  }
  const unmatchedStudents: StudentRecord[] = [];
  for (const student of pending) {
    const key = nameKey(student.studentName);
    const candidates = key ? [...left].filter((c) => nameKey(c.name) === key) : [];
    if (candidates.length === 1) {
      matches.push({ student, contact: candidates[0] });
      left.delete(candidates[0]);
    } else unmatchedStudents.push(student);
  }
  return { matches, unmatchedStudents, unmatchedContacts: [...left] };
}
