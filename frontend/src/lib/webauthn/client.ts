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

/** The PRF input. Fixed per credential, public, and stored server-side. */
export type PrfSalt = Uint8Array;

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
function decodeCreationOptions(json: string, prfSalt?: PrfSalt): CredentialCreationOptions {
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
  if (prfSalt) {
    // Asking at registration is how we learn whether PRF is available at all.
    (publicKey as PublicKeyCredentialCreationOptions & { extensions?: unknown }).extensions = {
      prf: { eval: { first: toArrayBuffer(prfSalt) } },
    };
  }
  return { publicKey };
}

function decodeRequestOptions(json: string, prfSalt?: PrfSalt): CredentialRequestOptions {
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
  if (prfSalt) {
    (publicKey as PublicKeyCredentialRequestOptions & { extensions?: unknown }).extensions = {
      prf: { eval: { first: toArrayBuffer(prfSalt) } },
    };
  }
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
export async function register(
  options: ServerOptions,
  prfSalt: PrfSalt,
): Promise<RegistrationResult> {
  const credential = (await navigator.credentials.create(
    decodeCreationOptions(options.options_json, prfSalt),
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

/** Run an authentication ceremony, optionally asking for the PRF secret. */
export async function authenticate(
  options: ServerOptions,
  prfSalt?: PrfSalt,
): Promise<AssertionResult> {
  const credential = (await navigator.credentials.get(
    decodeRequestOptions(options.options_json, prfSalt),
  )) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error('The passkey sign-in was cancelled.');
  }
  return {
    credentialJson: encodeAssertion(credential),
    prfOutput: readPrf(credential).output,
  };
}
