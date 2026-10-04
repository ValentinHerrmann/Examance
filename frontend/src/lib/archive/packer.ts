/**
 * Export a .bgproj archive, encrypting records with a fresh Argon2id key from the export password.
 * Freshness invariant: a new 16-byte salt and 12-byte nonce MUST be generated on every pack
 * (ciphertext uniqueness, no key/nonce reuse or replay).
 */

import { get } from 'svelte/store';
import { db } from '#lib/db/db';
import { scoreRepository } from '#lib/repositories/scoreRepository';
import { examRepository } from '#lib/repositories/examRepository';
import { sessionStore } from '#lib/stores/session';
import {
  BGPROJ_MAGIC,
  BGPROJ_VERSION,
  HEADER_SIZE,
  SALT_OFFSET,
  NONCE_OFFSET,
  PAYLOAD_OFFSET,
  type ProgressCallback,
} from './format';
import { deriveKey, generateSalt } from '#lib/crypto/keyDerivation';
import { deriveSessionKey } from '#lib/crypto/sessionKey';
import { decrypt, encryptJson, uint8ArrayToBase64 } from '#lib/crypto/aesGcm';
import {
  loadExamsEncrypted,
  loadExercisesEncrypted,
  loadStudentsEncrypted,
  loadSubmissionsEncrypted,
  decryptAuditEntry,
  decryptResourceBytes,
} from '#lib/db/dbEncryption';
import type { ExerciseRecord, SubmissionRecord } from '#lib/db/schema';
import { encodeBinary } from './binary';

/** Payload layout version: 2 added `$b64` bytes, decrypted scans, and `codeWithheld`. */
export const ARCHIVE_PAYLOAD_VERSION = 2;

export interface PackOptions {
  /**
   * Include the exercises' LaTeX and resource files (default). Off, the archive carries exams with
   * scans and results plus each exercise's name, points and answer key, but no code: a way to share
   * results with another teacher without handing over the exercises.
   */
  includeExerciseCode?: boolean;
}

/**
 * Scans and annotations are sealed under this account's key; another account could never open them.
 * Like resource files they travel decrypted inside the password envelope and are re-sealed on import.
 */
async function unsealScans(sub: SubmissionRecord, key: CryptoKey | null) {
  const { scanCt, scanIv, annotationCt, annotationIv, ...rest } = sub;
  const open = async (ct?: Uint8Array, iv?: Uint8Array) =>
    ct && iv && key ? decrypt(key, ct, iv) : undefined;
  return {
    ...rest,
    scanBytes: await open(scanCt, scanIv),
    annotationBytes: await open(annotationCt, annotationIv),
  };
}

function withoutCode(ex: ExerciseRecord): ExerciseRecord {
  return { ...ex, latexBody: undefined, codeWithheld: true };
}

export async function packProject(
  password: string,
  onProgress?: ProgressCallback,
  { includeExerciseCode = true }: PackOptions = {}
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
  // Decrypted like everything else: the importer re-seals them under its own key.
  const auditLogs = await Promise.all((await db.auditLog.toArray()).map((a) => decryptAuditEntry(a, key)));

  // Exercise links and MC groups, per exam, through the repository for the
  // same reason: the local Dexie tables can be empty in server-backed modes.
  const structures = await Promise.all(exams.map((e) => examRepository.getStructure(e.id)));
  const exerciseExams = structures.flatMap((s) => s.links);
  const examMcGroups = structures.flatMap((s) => s.mcGroups);

    // Resource files are decrypted with the session key and base64'd (JSON can't carry raw bytes);
    // the archive envelope protects them, and the importer re-encrypts under its own key.
  const exerciseResources = !includeExerciseCode ? [] : await Promise.all(
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

    // 4. Students/submissions are archived as-is, no re-hashing: the payload is already sealed under
    // the archive key, and leaving the student/submission link field alone keeps round-trips lossless.
  const archivePayload = {
    payloadVersion: ARCHIVE_PAYLOAD_VERSION,
    codeWithheld: !includeExerciseCode,
    exams,
    exercises: includeExerciseCode ? exercises : exercises.map(withoutCode),
    students,
    submissions: await Promise.all(submissions.map((sub) => unsealScans(sub, key))),
    exerciseScores,
    exerciseExams,
    examMcGroups,
    exerciseResources,
    auditLogs,
  };

  // 5. Encrypt payload with fresh archive session key using header nonce as IV. Bytes are encoded
  // explicitly (`binary.ts`): plain JSON turned every Uint8Array into an unreadable object.
  const archiveSessionKey = await deriveSessionKey(masterKey, nonce);
  const encryptedPayload = await encryptJson(encodeBinary(archivePayload), archiveSessionKey, nonce);

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
