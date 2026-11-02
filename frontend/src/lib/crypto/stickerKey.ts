/** Sticker ids and personal keys (issue #207, docs/dev/result_sharing.md): `K_sticker = HKDF-SHA-256(data key, "examance-sticker-v1")`; both values are HMACs under it, so the teacher can reprint them any time and nothing is stored. */

import { get } from 'svelte/store';
import { sessionStore } from '#lib/stores/session';
import { MissingSessionKeyError } from '#lib/db/decryptGuard';
import { codeFromBytes } from '#lib/utils/randomCode';

const encoder = new TextEncoder();
const SALT = encoder.encode('examance-sticker-v1');

/** Per data key; dropped with the key on lock. */
const cache = new WeakMap<CryptoKey, Promise<CryptoKey>>();

function stickerKey(): Promise<CryptoKey> {
  const master = get(sessionStore).masterKey;
  if (!master) throw new MissingSessionKeyError('sticker');
  let key = cache.get(master);
  if (!key) {
    key = crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt: SALT, info: encoder.encode('sticker') },
      master,
      { name: 'HMAC', hash: 'SHA-256', length: 256 },
      false,
      ['sign']
    );
    key.catch(() => cache.delete(master));
    cache.set(master, key);
  }
  return key;
}

async function mac(message: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.sign('HMAC', await stickerKey(), encoder.encode(message)));
}

/** The 8-character personal key printed next to a sticker; *raw* is the sticker's QR text, exactly as the scan stores it (`pseudonymRaw`). */
export async function personalKey(raw: string): Promise<string> {
  return codeFromBytes(await mac(`key:${raw.trim()}`), 8);
}

/** A stable 6-character id for a name without one, so a reprint yields the same sticker. */
export async function stickerId(name: string): Promise<string> {
  const normalized = name.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
  return codeFromBytes(await mac(`id:${normalized}`), 6);
}
