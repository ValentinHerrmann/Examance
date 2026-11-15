/** Extra working time of one student (issue #265, docs/dev/time_extensions.md): absolute minutes or a share of the exam's working time. The only place that converts, rounds and prints it. */

export type ExtensionUnit = 'min' | '%';
export interface TimeExtension {
  value: number;
  unit: ExtensionUnit;
}

/** The entered value as an extension; empty, zero or unreadable input means none. */
export function extensionFrom(value: string, unit: ExtensionUnit): TimeExtension | undefined {
  const number = Number(value.trim().replace(',', '.'));
  return value.trim() && Number.isFinite(number) && number > 0 && number <= 1440 ? { value: number, unit } : undefined;
}

export const sameExtension = (a?: TimeExtension, b?: TimeExtension): boolean => a?.value === b?.value && a?.unit === b?.unit;

/** Extra minutes: a share is rounded up to half minutes, so a student never gets less than granted; null for a share without a working time. */
export function extensionMinutes(ext: TimeExtension, durationMinutes?: number | null): number | null {
  if (ext.unit === 'min') return ext.value;
  if (!durationMinutes) return null;
  // The epsilon keeps a float error (30 × 25 % = 7.500000001) from adding half a minute.
  return Math.ceil((durationMinutes * ext.value) / 50 - 1e-9) / 2;
}

/** Printed number: German decimal comma, as exam output is German. */
const printedNumber = (value: number): string => String(Math.round(value * 100) / 100).replace('.', ',');

/** As entered: "+10 Min" or "+25 %". */
export function extensionLabel(ext: TimeExtension): string {
  return ext.unit === 'min' ? `+${printedNumber(ext.value)} Min` : `+${printedNumber(ext.value)} %`;
}

/** As printed next to the name: "+10 Min", "+25 % (+7,5 Min)", or "+25 %" while the exam has no working time. */
export function printedExtension(ext: TimeExtension, durationMinutes?: number | null): string {
  const minutes = extensionMinutes(ext, durationMinutes);
  return ext.unit === 'min' || minutes === null ? extensionLabel(ext) : `${extensionLabel(ext)} (+${printedNumber(minutes)} Min)`;
}
