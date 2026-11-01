/** An HKDF data key as the session holds it (`sessionStore.masterKey`): pseudonym keys derive from it (issue #177), so an AES key there makes every repository write throw. */
export function hkdfMasterKey(fill = 7): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', new Uint8Array(32).fill(fill), 'HKDF', false, ['deriveKey', 'deriveBits']);
}
