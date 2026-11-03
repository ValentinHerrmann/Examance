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
  return `${formatStudentName(name)}_${id.replace(/_/g, '').trim()}`;
}

const UUID_RAW = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The QR text a student's sticker carried, or null for students added by hand or from unmatched pages (their raw id is a minted UUID): only a sticker can carry a personal key. */
export function stickerRawOf(student: { pseudonymRaw?: string }): string | null {
  const raw = student.pseudonymRaw?.trim();
  return raw && !UUID_RAW.test(raw) ? raw : null;
}
