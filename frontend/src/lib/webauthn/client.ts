/**
 * WebAuthn ceremonies in the browser, two jobs: (1) authentication, a passkey being one of three sign-in factors; (2) key
 * recovery, where a PRF-capable authenticator derives a device-bound secret that wraps a copy of the data key. Without PRF
 * the passkey only signs in, and the UI must say so.
 */

import { fromBase64url, toArrayBuffer, toBase64url } from '#lib/crypto/aesGcm';

/**
 * The PRF input, fixed for the whole app: it must be supplied *before* the ceremony and at sign-in the answering passkey is
 * unknown (`/webauthn/login/options` takes no account identifier on purpose), so no per-credential value is possible. A
 * constant is fine: a PRF salt is a public domain-separation input and the derived secret stays per credential.
 */
export const APP_PRF_SALT: Uint8Array = new TextEncoder().encode(
  'examance-passkey-prf-v1--------',
);

export function isSupported(): boolean {
  return typeof window !== 'undefined' && 'PublicKeyCredential' in window;
}

/** Whether this browser can offer a platform authenticator; feature-detecting `PublicKeyCredential` alone isn't enough. */
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

/** py_webauthn returns JSON with base64url fields but `navigator.credentials` wants ArrayBuffers; this walks the known binary fields. */
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

/**
 * Run an authentication ceremony, always asking for the PRF secret. `credentialIdB64` pins it to one
 * passkey: wrapping needs *that* credential's PRF secret, and an account-wide prompt could yield a
 * secret from the wrong passkey, sealing a wrap that never opens.
 */
export async function authenticate(
  options: ServerOptions,
  opts: { credentialIdB64?: string } = {},
): Promise<AssertionResult> {
  const request = decodeRequestOptions(options.options_json);
  if (opts.credentialIdB64 && request.publicKey) {
    request.publicKey.allowCredentials = [
      { type: 'public-key', id: toArrayBuffer(fromBase64url(opts.credentialIdB64.replace(/=+$/, ''))) },
    ];
  }
  const credential = (await navigator.credentials.get(request)) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error('The passkey sign-in was cancelled.');
  }
  return {
    credentialJson: encodeAssertion(credential),
    prfOutput: readPrf(credential).output,
  };
}
