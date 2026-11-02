/** Adding a passkey, from an open session: register it, then wrap the data key under its PRF secret. One flow for the settings card and the domain-move prompt (issue #198). */
import { loginOptions, registrationOptions, verifyRegistration, type PasskeySummary } from '#lib/api/webauthn';
import { addPasskeyWrap, vaultFromSession } from '#lib/services/keyEnvelopeService';
import { authenticate, register } from '#lib/webauthn/client';

/** `opensData`: wrapped; `noPrf`: the provider has no PRF; `pending`: registered, but the wrap failed (enable it later); `noVault`: no open session to wrap from. */
export type PasskeyWrapOutcome = 'opensData' | 'noPrf' | 'pending' | 'noVault';

export interface AddedPasskey {
  summary: PasskeySummary;
  wrap: PasskeyWrapOutcome;
}

/** Throws when registration itself fails (cancelled, refused by the server); a failed wrap only reports `pending`. */
export async function addPasskey(teacherId: string, nickname: string | null): Promise<AddedPasskey> {
  const options = await registrationOptions();
  // Both ceremonies use the app-wide PRF input, which keeps the secret reproducible at sign-in.
  const result = await register(options);
  const summary = await verifyRegistration({
    handle: options.handle,
    challenge_b64: options.challenge_b64,
    credential_json: result.credentialJson,
    supports_prf: result.supportsPrf,
    nickname,
  });

  const vault = vaultFromSession();
  if (!vault) return { summary, wrap: 'noVault' };
  try {
    // Providers that evaluate PRF at creation need no second prompt (issue #71); the others get one, pinned to the new credential so no other passkey seals it.
    const prfOutput =
      result.prfOutput ??
      (
        await authenticate(await loginOptions(), {
          credentialIdB64: summary.credential_id_b64,
          transports: result.transports,
        })
      ).prfOutput;
    if (!prfOutput) return { summary, wrap: 'noPrf' };
    await addPasskeyWrap(teacherId, vault, summary.credential_id_b64, prfOutput);
    return { summary, wrap: 'opensData' };
  } catch {
    return { summary, wrap: 'pending' };
  }
}
