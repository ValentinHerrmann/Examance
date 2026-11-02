/** Factor steps shared by sign-in (`routes/unlock`) and password reset (`routes/reset-password`); each page keeps its own flow. A passkey's PRF secret (`unwrap`) can also open the vault. */
import { ApiError } from "#lib/api/client";
import type { AuthStep } from "#lib/api/mfa";
import { loginOptions, verifyLogin } from "#lib/api/webauthn";
import { translate } from "#lib/i18n";
import { authenticate } from "#lib/webauthn/client";

export interface PasskeyUnwrap {
  credentialIdB64: string;
  prfOutput: Uint8Array;
}

/** The browser ceremony alone; `unwrap` is null when the authenticator returned no PRF secret. `legacy` uses a passkey of the old address (domain move). */
export async function passkeyAssertion(opts: { legacy?: boolean } = {}) {
  const options = await loginOptions(opts);
  const assertion = await authenticate(options);
  const unwrap: PasskeyUnwrap | null = assertion.prfOutput
    ? { credentialIdB64: (JSON.parse(assertion.credentialJson) as { rawId: string }).rawId, prfOutput: assertion.prfOutput }
    : null;
  return { options, assertion, unwrap };
}

/** A passkey presented as a sign-in factor: the ceremony plus the server's verdict. */
export async function signInWithPasskey(
  opts: { legacy?: boolean } = {},
): Promise<{ step: AuthStep; unwrap: PasskeyUnwrap | null }> {
  const { options, assertion, unwrap } = await passkeyAssertion(opts);
  const step = await verifyLogin({
    handle: options.handle,
    challenge_b64: options.challenge_b64,
    credential_json: assertion.credentialJson,
  });
  return { step, unwrap };
}

/** Message for a refused authenticator or backup code. */
export function codeFactorError(err: unknown): string {
  const code = err instanceof ApiError ? err.code : "";
  if (code === "ERR_ACCOUNT_LOCKED") return translate("errors.code.ERR_ACCOUNT_LOCKED");
  // Right code, spent window: every sign-in straight after a reset lands here, as the reset took one.
  if (code === "ERR_MFA_CODE_ALREADY_USED") return translate("security.factors.alreadyUsed");
  // A wrong code is retryable, an expired step is not: "invalid" would have the teacher retype into a dead sign-in.
  if (code === "ERR_STEP_EXPIRED") return translate("security.factors.expired");
  return translate("security.factors.invalid");
}
