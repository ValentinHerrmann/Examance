/**
 * Key-envelope API — the wrapped copies of this teacher's data key.
 *
 * Everything crossing this boundary is opaque to the server: ciphertext, a
 * public salt and public KDF parameters. Wrapping and unwrapping happen in
 * `lib/crypto/keyEnvelope.ts`, in this browser.
 */

import { base64ToUint8Array, uint8ArrayToBase64 } from '$lib/crypto/aesGcm';
import type { EnvelopeKind, EnvelopeSet, KeyEnvelope } from '$lib/crypto/keyEnvelope';
import { api } from './client';

interface KeyEnvelopeDto {
  id: string;
  kind: EnvelopeKind;
  credential_id_b64: string | null;
  kdf: 'argon2id' | 'hkdf';
  kdf_salt_b64: string;
  kdf_params: Record<string, number>;
  wrapped_bundle_b64: string;
  wrap_iv_b64: string;
  key_id_b64: string;
  envelope_version: number;
  invalidated_at: string | null;
  created_at: string;
}

interface KeyEnvelopeListDto {
  key_id_b64: string | null;
  envelopes: KeyEnvelopeDto[];
}

function fromDto(dto: KeyEnvelopeDto): KeyEnvelope {
  return {
    id: dto.id,
    kind: dto.kind,
    credentialIdB64: dto.credential_id_b64,
    kdf: dto.kdf,
    kdfSalt: base64ToUint8Array(dto.kdf_salt_b64),
    kdfParams: dto.kdf_params,
    wrappedBundle: base64ToUint8Array(dto.wrapped_bundle_b64),
    wrapIv: base64ToUint8Array(dto.wrap_iv_b64),
    invalidatedAt: dto.invalidated_at,
  };
}

export function toDto(envelope: KeyEnvelope): Record<string, unknown> {
  return {
    kind: envelope.kind,
    credential_id_b64: envelope.credentialIdB64,
    kdf: envelope.kdf,
    kdf_salt_b64: uint8ArrayToBase64(envelope.kdfSalt),
    kdf_params: envelope.kdfParams,
    wrapped_bundle_b64: uint8ArrayToBase64(envelope.wrappedBundle),
    wrap_iv_b64: uint8ArrayToBase64(envelope.wrapIv),
  };
}

/**
 * Fetch the teacher's envelope set. Returns null when none exists yet — that is
 * the signal to run the one-time migration, not an error.
 */
export async function fetchEnvelopes(): Promise<EnvelopeSet | null> {
  const dto = await api.get<KeyEnvelopeListDto>('/keys/envelopes', { silentError: true });
  if (!dto.key_id_b64 || dto.envelopes.length === 0) {
    return null;
  }
  return {
    keyId: base64ToUint8Array(dto.key_id_b64),
    envelopes: dto.envelopes.map(fromDto),
  };
}

/**
 * Replace the whole envelope set.
 *
 * Wholesale by design. A merge could leave the password wrap holding a new DEK
 * while the recovery wrap still holds the previous one, which looks healthy
 * right up until the day someone needs to recover with it.
 */
export async function saveEnvelopes(set: EnvelopeSet): Promise<void> {
  // Silent, like the fetch: callers report an envelope write failure in the
  // dialog the teacher is looking at. The global HTTP modal on top of that is
  // one error reported twice.
  await api.put(
    '/keys/envelopes',
    {
      key_id_b64: uint8ArrayToBase64(set.keyId),
      envelope_version: 1,
      envelopes: set.envelopes.map(toDto),
    },
    { silentError: true },
  );
}

/** Remove one wrap — used when a passkey is deregistered. */
export async function deleteEnvelope(id: string): Promise<void> {
  await api.delete(`/keys/envelopes/${id}`, { silentError: true });
}

/**
 * The wire shape of a whole envelope set.
 *
 * Exported because a password reset sends it inside the reset request rather
 * than through `PUT /keys/envelopes`: the new password and the key copy that
 * matches it are written in one transaction, so they cannot end up disagreeing.
 */
export function envelopeSetToDto(set: EnvelopeSet): Record<string, unknown> {
  return {
    key_id_b64: uint8ArrayToBase64(set.keyId),
    envelope_version: 1,
    envelopes: set.envelopes.map(toDto),
  };
}
