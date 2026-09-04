/**
 * WebAuthn ceremonies in the browser.
 *
 * Two jobs, and it is worth keeping them apart:
 *
 *  1. Authentication — a passkey is one of the three sign-in factors.
 *  2. Key recovery — where the authenticator implements the PRF extension, it
 *     derives a secret that never leaves the device, and that secret wraps a
 *     copy of the data key. Where it does not, the passkey signs in and nothing
 *     more, and the UI has to say so rather than let anyone assume otherwise.
 */

import { fromBase64url, toArrayBuffer, toBase64url } from '$lib/crypto/aesGcm';

/**
 * The PRF input, fixed for the whole application.
 *
 * It has to be supplied *before* the ceremony, and at sign-in nobody yet knows
 * which passkey will answer — `/webauthn/login/options` takes no account
 * identifier on purpose, so it cannot hand back a per-credential value. That is
 * why the sign-in paths used to pass nothing at all, which meant the extension
 * was never requested and no passkey could ever open the vault.
 *
 * A constant is the right answer rather than a compromise: a PRF salt is a
 * public domain-separation input, not a secret. The derived secret is still
 * unique per credential, because the authenticator's PRF key is per credential
 * and scoped to the relying party. Per-wrap randomness is unaffected —
 * `addPasskeyWrap` generates its own random HKDF salt for the envelope.
 */
export const APP_PRF_SALT: Uint8Array = new TextEncoder().encode(
  'examance-passkey-prf-v1--------',
);

export function isSupported(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window;
}

/**
 * Whether this browser can offer a platform authenticator at all.
 *
 * Feature-detecting the API is not enough: a browser can expose
 * `PublicKeyCredential` and still have nothing to authenticate with.
 */
export async function hasPlatformAuthenticator(): Promise<boolean> {
  if (!isSupported()) {
    return false;
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

interface ServerOptions {
  handle: string;
  challenge_b64: string;
  options_json: string;
}

/**
 * py_webauthn hands us JSON with base64url fields; `navigator.credentials`
 * wants ArrayBuffers. This walks the known binary fields rather than guessing.
 */
export function decodeCreationOptions(json: string): CredentialCreationOptions {
  const parsed = JSON.parse(json);
  const publicKey: PublicKeyCredentialCreationOptions = {
    ...parsed,
    challenge: fromBase64url(parsed.challenge),
    user: { ...parsed.user, id: fromBase64url(parsed.user.id) },
    excludeCredentials: (parsed.excludeCredentials ?? []).map(
      (c: { id: string; type: string; transports?: string[] }) => ({
        ...c,
        id: fromBase64url(c.id),
      }),
    ),
  };
  // Unconditional. Asking at registration is how we learn whether PRF works
  // here at all, and there is deliberately no call shape left that asks for
  // nothing — that shape is what made every sign-in silently keyless.
  (publicKey as PublicKeyCredentialCreationOptions & { extensions?: unknown }).extensions = {
    prf: { eval: { first: toArrayBuffer(APP_PRF_SALT) } },
  };
  return { publicKey };
}

export function decodeRequestOptions(json: string): CredentialRequestOptions {
  const parsed = JSON.parse(json);
  const publicKey: PublicKeyCredentialRequestOptions = {
    ...parsed,
    challenge: fromBase64url(parsed.challenge),
    allowCredentials: (parsed.allowCredentials ?? []).map(
      (c: { id: string; type: string; transports?: string[] }) => ({
        ...c,
        id: fromBase64url(c.id),
      }),
    ),
  };
  (publicKey as PublicKeyCredentialRequestOptions & { extensions?: unknown }).extensions = {
    prf: { eval: { first: toArrayBuffer(APP_PRF_SALT) } },
  };
  return { publicKey };
}

/** Serialize a credential the way py_webauthn's verifiers expect it. */
function encodeAttestation(credential: PublicKeyCredential): string {
  const response = credential.response as AuthenticatorAttestationResponse;
  return JSON.stringify({
    id: credential.id,
    rawId: toBase64url(new Uint8Array(credential.rawId)),
    type: credential.type,
    response: {
      clientDataJSON: toBase64url(new Uint8Array(response.clientDataJSON)),
      attestationObject: toBase64url(new Uint8Array(response.attestationObject)),
    },
  });
}

function encodeAssertion(credential: PublicKeyCredential): string {
  const response = credential.response as AuthenticatorAssertionResponse;
  return JSON.stringify({
    id: credential.id,
    rawId: toBase64url(new Uint8Array(credential.rawId)),
    type: credential.type,
    response: {
      clientDataJSON: toBase64url(new Uint8Array(response.clientDataJSON)),
      authenticatorData: toBase64url(new Uint8Array(response.authenticatorData)),
      signature: toBase64url(new Uint8Array(response.signature)),
      userHandle: response.userHandle
        ? toBase64url(new Uint8Array(response.userHandle))
        : null,
    },
  });
}

interface PrfResults {
  enabled?: boolean;
  results?: { first?: ArrayBuffer };
}

function readPrf(credential: PublicKeyCredential): {
  enabled: boolean;
  output: Uint8Array | null;
} {
  const ext = credential.getClientExtensionResults() as { prf?: PrfResults };
  const prf = ext.prf;
  if (!prf) {
    return { enabled: false, output: null };
  }
  const first = prf.results?.first;
  return {
    // `enabled` is what registration reports; a returned result is what an
    // assertion gives. Either one means the extension works here.
    enabled: prf.enabled === true || first !== undefined,
    output: first ? new Uint8Array(first) : null,
  };
}

export interface RegistrationResult {
  credentialJson: string;
  supportsPrf: boolean;
}

/** Run a registration ceremony. Throws if the user cancels or it is unsupported. */
export async function register(options: ServerOptions): Promise<RegistrationResult> {
  const credential = (await navigator.credentials.create(
    decodeCreationOptions(options.options_json),
  )) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error('The passkey registration was cancelled.');
  }
  return {
    credentialJson: encodeAttestation(credential),
    supportsPrf: readPrf(credential).enabled,
  };
}

export interface AssertionResult {
  credentialJson: string;
  /** Present only where the authenticator implements PRF. */
  prfOutput: Uint8Array | null;
}

/** Run an authentication ceremony, always asking for the PRF secret. */
export async function authenticate(options: ServerOptions): Promise<AssertionResult> {
  const credential = (await navigator.credentials.get(
    decodeRequestOptions(options.options_json),
  )) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error('The passkey sign-in was cancelled.');
  }
  return {
    credentialJson: encodeAssertion(credential),
    prfOutput: readPrf(credential).output,
  };
}
