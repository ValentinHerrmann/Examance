import { applyArchive, decryptArchive, type ImportResult } from '../../src/lib/archive/unpacker';

/** Decrypts an archive and applies it in one call, as the import dialog does in two steps (conflicts are resolved in between there). */
export async function unpackProject(archiveData: Blob | ArrayBuffer | Uint8Array, password: string): Promise<ImportResult> {
  return applyArchive(await decryptArchive(archiveData, password));
}
