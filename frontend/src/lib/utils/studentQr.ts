/** Parses student identity from QR strings: `Lastname, Firstname_NumericID`, `BG:Lastname, Firstname_NumericID:version:fallbackCode`, or `Lastname_NumericID` (no first name). */

export interface ParsedStudentQr {
  lastname: string;
  firstname: string;
  studentNumber: string;
  displayName: string;
}

/** Display form of a "Lastname, Firstname" name with empty parts dropped, so a missing last name gives "Firstname", not ", Firstname". Also cleans names stored before this existed. */
export function formatStudentName(name: string | null | undefined): string {
  return (name ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
}

/** The first given name of "Lastname, Firstname" or "Firstname Lastname" (`Maier, Anna Lena` → `Anna`); a single word is returned as it is. */
export function givenName(name: string): string {
  const comma = name.indexOf(',');
  const given = comma >= 0 ? name.slice(comma + 1) : name;
  return given.trim().split(/\s+/)[0] ?? '';
}

/** A name with its given names cut to initials (`Anna-Lena Maier` → `A.-L. Maier`, `Maier, Anna` → `Maier, A.`), so a long name printed in little room (the copies' corner tab) keeps its surname whole; the name itself if nothing shortens. */
export function abbreviateGivenNames(name: string): string {
  const initials = (given: string) => given.split(/\s+/).filter(Boolean).map((w) => w.split('-').map((p) => `${p.charAt(0)}.`).join('-')).join(' ');
  const comma = name.indexOf(',');
  if (comma >= 0) return `${name.slice(0, comma).trim()}, ${initials(name.slice(comma + 1))}`.trim().replace(/,$/, '');
  const words = name.trim().split(/\s+/);
  return words.length < 2 ? name : `${initials(words.slice(0, -1).join(' '))} ${words.at(-1)}`;
}

export function parseStudentQr(
  qrString: string | null | undefined,
): ParsedStudentQr | null {
  if (!qrString || typeof qrString !== 'string') return null;

  let target = qrString.trim();

  // Strip `BG:` prefix if present (BlindGrade format)
  if (target.startsWith('BG:')) {
    const parts = target.split(':');
    if (parts.length >= 2) {
      target = parts[1];
    }
  }

  // Split on the last underscore to separate name from student number
  const underscoreIdx = target.lastIndexOf('_');
  if (underscoreIdx === -1) return null;

  const namePart = target.substring(0, underscoreIdx).trim();
  const studentNumber = target.substring(underscoreIdx + 1).trim();

  if (!namePart) return null;

  // Split name on comma: "Lastname, Firstname"
  const commaIdx = namePart.indexOf(',');
  if (commaIdx === -1) {
    return {
      lastname: namePart,
      firstname: '',
      studentNumber,
      displayName: namePart,
    };
  }

  const lastname = namePart.substring(0, commaIdx).trim();
  const firstname = namePart.substring(commaIdx + 1).trim();
  const displayName = formatStudentName(`${lastname}, ${firstname}`);

  return {
    lastname,
    firstname,
    studentNumber,
    displayName,
  };
}

/** The sticker payload `parseStudentQr` reads back (and DiRueLei prints): `Lastname, Firstname_ID`; underscores in the id would move the split, so they are dropped. */
export function formatStudentQr(name: string, id: string): string {
  return `${formatStudentName(name)}_${id.replaceAll('_', '').trim()}`;
}

const UUID_RAW = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The QR text a student's sticker carried, or null for students added by hand or from unmatched pages (their raw id is a minted UUID): only a sticker can carry a personal key. */
export function stickerRawOf(student: { pseudonymRaw?: string }): string | null {
  const raw = student.pseudonymRaw?.trim();
  return raw && !UUID_RAW.test(raw) ? raw : null;
}

/** Prefixes Mebis puts before a participant id (`Teilnehmer/in6028356`, `Participant 6028356`); DiRueLei stickers printed them into the QR code. */
const LMS_ID_PREFIX = /^(?:teilnehmer\/?in|teilnehmer|participant)\s*/i;

/** A Mebis participant id or Artemis user id as plain digits, or null when *value* is not one. */
export function normalizeLmsId(value: string | null | undefined): string | null {
  const id = (value ?? '').trim().replace(LMS_ID_PREFIX, '');
  return /^\d+$/.test(id) ? id : null;
}

/** The numeric id in a student's sticker payload; which LMS it belongs to depends on the list the stickers came from. */
export function stickerLmsId(student: { pseudonymRaw?: string }): string | null {
  return normalizeLmsId(parseStudentQr(stickerRawOf(student))?.studentNumber);
}

type WithIds = { mebisId?: string; artemisId?: string };

/** The Mebis participant id (issue #209): only the stored one, never the sticker's, whose list is unknown (issue #284). */
export function mebisIdOf(student: WithIds): string | null {
  return normalizeLmsId(student.mebisId);
}

/** The Artemis user id: only the stored one, never the sticker's, so a Mebis number never becomes an Artemis recipient (issue #284). */
export function artemisIdOf(student: WithIds): string | null {
  return normalizeLmsId(student.artemisId);
}

/** The Mebis id of a DiRueLei sticker, whose payload carries the Mebis prefix (`Teilnehmer/in6028356`); for matching an imported Mebis list only. */
export function mebisStickerId(student: { pseudonymRaw?: string }): string | null {
  const number = parseStudentQr(stickerRawOf(student))?.studentNumber ?? '';
  return LMS_ID_PREFIX.test(number) ? normalizeLmsId(number) : null;
}
