/**
 * Byte arrays inside the .bgproj JSON payload are stored as `{ $b64: "…" }`: `JSON.stringify` writes a `Uint8Array` as
 * numbered keys, which no decoder accepts. Reading also understands that old numbered-key shape.
 */

import { base64ToUint8Array, uint8ArrayToBase64 } from '#lib/crypto/aesGcm';

/** Fields that held bytes in archives written before `$b64` existed. */
const LEGACY_BINARY_FIELDS = new Set([
  'scanCt',
  'scanIv',
  'annotationCt',
  'annotationIv',
  'piiCt',
  'piiIv',
  'payloadCt',
  'payloadIv',
  'dataCt',
  'dataIv',
]);

/** Deep copy with every `Uint8Array` replaced by `{ $b64 }`, ready for `JSON.stringify`. */
export function encodeBinary(value: unknown): unknown {
  if (value instanceof Uint8Array) return { $b64: uint8ArrayToBase64(value) };
  if (Array.isArray(value)) return value.map(encodeBinary);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = encodeBinary(v);
    }
    return out;
  }
  return value;
}

function isLegacyByteObject(value: unknown): value is Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((k, i) => k === String(i)) && Object.values(value).every((n) => typeof n === 'number');
}

/** Inverse of `encodeBinary`, applied to a freshly parsed payload. */
export function decodeBinary(value: unknown, field?: string): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>;
    if (typeof obj.$b64 === 'string' && Object.keys(obj).length === 1) return base64ToUint8Array(obj.$b64);
    if (field && LEGACY_BINARY_FIELDS.has(field) && isLegacyByteObject(obj)) {
      return Uint8Array.from(Object.values(obj));
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = decodeBinary(v, k);
    return out;
  }
  if (Array.isArray(value)) return value.map((v) => decodeBinary(v));
  return value;
}
