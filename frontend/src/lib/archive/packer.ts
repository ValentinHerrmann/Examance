/**
 * Export .bgproj archive file.
 *
 * Encrypts current IndexedDB records using a fresh Argon2id key derived from the user-provided export password.
 * Nonce and Salt Freshness Invariant: A fresh salt (16 bytes) and fresh session nonce (12 bytes) MUST be generated
 * for every single pack operation to ensure ciphertext uniqueness and prevent replay/key-reuse vulnerabilities.
 */

import { get } from 'svelte/store';
import { db } from '$lib/db/db';
import { scoreRepository } from '$lib/repositories/scoreRepository';
import { examRepository } from '$lib/repositories/examRepository';
import { sessionStore } from '$lib/stores/session';
import {
  BGPROJ_MAGIC,
  BGPROJ_VERSION,
  HEADER_SIZE,
  SALT_OFFSET,
  NONCE_OFFSET,
  PAYLOAD_OFFSET,
  type ProgressCallback,
} from './format';
import { deriveKey, generateSalt } from '$lib/crypto/keyDerivation';
import { deriveSessionKey } from '$lib/crypto/sessionKey';
import { encryptJson, uint8ArrayToBase64 } from '$lib/crypto/aesGcm';
import {
  loadExamsEncrypted,
  loadExercisesEncrypted,
  loadStudentsEncrypted,
  loadSubmissionsEncrypted,
  decryptResourceBytes,
} from '$lib/db/dbEncryption';

export async function packProject(
  password: string,
  onProgress?: ProgressCallback
): Promise<Blob> {
  onProgress?.({
    phase: 'encrypting',
    current: 0,
    total: 100,
    message: 'Starting project encryption...',
  });

  // 1. NONCE & SALT FRESHNESS: Generate fresh salt and nonce for every single export
  const salt = generateSalt();
  const nonce = new Uint8Array(12);
  crypto.getRandomValues(nonce);

  // 2. Derive the fresh master key.
  const { masterKey } = await deriveKey(password, salt);

  // 3. Collect records from IDB
  const key = get(sessionStore).sessionKey;
  const exams = await loadExamsEncrypted(key);
  const exercises = await loadExercisesEncrypted(key);
  const students = await loadStudentsEncrypted(key);
  // The archive is the export/import bridge — it must carry every scan, not
  // just presence flags, so this is the one caller that opts into the heavy
  // list response.
  const submissions = await loadSubmissionsEncrypted(key, { includeScans: true });
  // Through the repository, not Dexie directly — in all-server mode the local
  // cache can be empty (e.g. right after a lock).
  const exerciseScores = await scoreRepository.getAll(exams.map((e) => e.id), key);
  const rawAuditLogs = await db.auditLog.toArray();

  // Exercise links and MC groups, per exam, through the repository for the
  // same reason: the local Dexie tables can be empty in server-backed modes.
  const structures = await Promise.all(exams.map((e) => examRepository.getStructure(e.id)));
  const exerciseExams = structures.flatMap((s) => s.links);
  const examMcGroups = structures.flatMap((s) => s.mcGroups);

  // Resource files are unwrapped like every other record — decrypted with the
  // current session key and base64'd, because JSON cannot carry raw bytes. The
  // archive envelope itself is what protects them; the importer re-encrypts
  // under its own key.
  const exerciseResources = await Promise.all(
    (await db.exerciseResources.toArray()).map(async r => ({
      id: r.id,
      exerciseId: r.exerciseId,
      filename: r.filename,
      mimeType: r.mimeType,
      byteSize: r.byteSize,
      createdAt: r.createdAt,
      dataB64: uint8ArrayToBase64(await decryptResourceBytes(r, key)),
    }))
  );

  onProgress?.({
    phase: 'encrypting',
    current: 30,
    total: 100,
    message: 'Encrypting database records...',
  });

  // 4. Students and submissions are archived exactly as they are, with no
  // re-hashing: the payload is already sealed under the archive key, and
  // leaving the student/submission link field alone is what keeps a
  // round-trip lossless.
  const archivePayload = {
    exams,
    exercises,
    students,
    submissions,
    exerciseScores,
    exerciseExams,
    examMcGroups,
    exerciseResources,
    auditLogs: rawAuditLogs,
  };

  // 5. Encrypt payload with fresh archive session key using header nonce as IV
  const archiveSessionKey = await deriveSessionKey(masterKey, nonce);
  const encryptedPayload = await encryptJson(archivePayload, archiveSessionKey, nonce);

  onProgress?.({
    phase: 'packing',
    current: 70,
    total: 100,
    message: 'Writing archive binary header...',
  });

  // 6. Build binary layout: Magic (7) + Version (1) + Salt (16) + Nonce (12) + Payload
  const totalLength = HEADER_SIZE + encryptedPayload.ciphertext.byteLength;
  const fileBuffer = new Uint8Array(totalLength);

  // Write magic bytes "BGPROJ\0"
  fileBuffer.set(BGPROJ_MAGIC, 0);
  // Write version
  fileBuffer[6] = BGPROJ_VERSION;
  // Write salt & nonce
  fileBuffer.set(salt, SALT_OFFSET);
  fileBuffer.set(nonce, NONCE_OFFSET);
  // Write payload length (4 bytes UInt32BE) at offset 35
  const view = new DataView(fileBuffer.buffer);
  view.setUint32(35, encryptedPayload.ciphertext.byteLength, false);
  // Write ciphertext payload
  fileBuffer.set(new Uint8Array(encryptedPayload.ciphertext), PAYLOAD_OFFSET);

  onProgress?.({
    phase: 'complete',
    current: 100,
    total: 100,
    message: 'Project archive created successfully.',
  });

  return new Blob([fileBuffer], { type: 'application/octet-stream' });
}
