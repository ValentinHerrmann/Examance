import { describe, it, expect } from 'vitest';
import {
  APP_PRF_SALT,
  decodeCreationOptions,
  decodeRequestOptions,
} from '../src/lib/webauthn/client';

/**
 * The bug this pins: the PRF extension was attached only when a salt was passed,
 * and every sign-in path passed none. So no assertion ever asked for the secret,
 * `prfOutput` was always null, and a passkey wrap created at registration could
 * never be opened by anything.
 *
 * The salt is a constant now precisely so there is no call shape left that
 * silently asks for nothing.
 */

const CREATION = JSON.stringify({
  challenge: 'AAAA',
  rp: { id: 'example.test', name: 'Examance' },
  user: { id: 'BBBB', name: 'u@example.test', displayName: 'u@example.test' },
  pubKeyCredParams: [],
  excludeCredentials: [],
});

const REQUEST = JSON.stringify({
  challenge: 'AAAA',
  rpId: 'example.test',
  allowCredentials: [],
});

function prfInput(options: { publicKey?: unknown }): Uint8Array {
  const publicKey = options.publicKey as { extensions?: { prf?: { eval?: { first?: unknown } } } };
  const first = publicKey.extensions?.prf?.eval?.first;
  expect(first, 'the ceremony was built without the PRF extension').toBeDefined();
  return new Uint8Array(first as ArrayBuffer);
}

describe('webauthn ceremony options', () => {
  it('asks for the PRF secret when registering', () => {
    expect(Array.from(prfInput(decodeCreationOptions(CREATION)))).toEqual(
      Array.from(APP_PRF_SALT),
    );
  });

  it('asks for the PRF secret when authenticating', () => {
    // The half that was broken: without this the passkey signs in and yields
    // nothing that can open the vault.
    expect(Array.from(prfInput(decodeRequestOptions(REQUEST)))).toEqual(
      Array.from(APP_PRF_SALT),
    );
  });

  it('uses one input for both, so a wrap made at registration opens at sign-in', () => {
    expect(Array.from(prfInput(decodeCreationOptions(CREATION)))).toEqual(
      Array.from(prfInput(decodeRequestOptions(REQUEST))),
    );
  });
});
