/** What a decoded QR text says about the student (kept out of the worker module, which installs a message handler when imported). */

/** A student code read from a sticker or a personalised page code. */
export interface QrResult {
  type: 'QR_RESULT';
  pseudonymId: string;
  version: string;
  fallbackCode?: string;
  rawText?: string;
}

/** `BG:pseudonym:version:fallback` codes split into parts; any other payload (a name sticker) is its own pseudonym. */
export function qrResultOf(rawValue: string): QrResult {
  const parts = rawValue.split(':');
  if (parts[0] === 'BG' && parts.length >= 3) {
    return { type: 'QR_RESULT', pseudonymId: parts[1], version: parts[2], fallbackCode: parts[3], rawText: rawValue };
  }
  return { type: 'QR_RESULT', pseudonymId: rawValue, version: 'A', fallbackCode: rawValue, rawText: rawValue };
}
