/**
 * Parses student identity from QR strings: `Lastname, Firstname_NumericID`,
 * `BG:Lastname, Firstname_NumericID:version:fallbackCode`, or `Lastname_NumericID` (no first name).
 */

export interface ParsedStudentQr {
  lastname: string;
  firstname: string;
  studentNumber: string;
  displayName: string;
}

/**
 * Display form of a "Lastname, Firstname" name with empty parts dropped, so a missing last name
 * gives "Firstname", not ", Firstname". Also cleans names stored before this existed.
 */
export function formatStudentName(name: string | null | undefined): string {
  return (name ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .join(', ');
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
