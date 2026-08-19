/**
 * .bgproj Archive Format Definition.
 *
 * Header layout:
 *   [7 bytes]  Magic: 0x42 0x47 0x50 0x52 0x4F 0x4A 0x01 ("BGPROJ\x01")
 *   [1 byte]   Format version: 0x01
 *   [16 bytes] Argon2id salt (for key re-derivation)
 *   [12 bytes] AES-GCM nonce (for outer envelope)
 *   [4 bytes]  Ciphertext length (uint32 BE)
 *   [2 bytes]  Reserved / padding
 *   [N bytes]  AES-GCM ciphertext of inner bundle
 */

export const BGPROJ_MAGIC = new Uint8Array([0x42, 0x47, 0x50, 0x52, 0x4f, 0x4a, 0x01]);
export const BGPROJ_VERSION = 0x01;
export const MAGIC_BYTES = new Uint8Array([0x42, 0x47, 0x50, 0x4a]);
export const FORMAT_VERSION = 0x01;
export const ARCHIVE_SECRET_PURPOSE = 'bgproj-link';

export const HEADER_SIZE = 41;
export const SALT_OFFSET = 7;
export const NONCE_OFFSET = 23;
export const PAYLOAD_OFFSET = 41;

export interface BgprojHeader {
  magic: Uint8Array;
  version: number;
  salt: Uint8Array;
  nonce: Uint8Array;
  payloadLen: number;
}

export interface ProgressEvent {
  stage: string;
  current: number;
  total: number;
}

export type ProgressCallback = (event: {
  phase: string;
  current: number;
  total: number;
  message?: string;
}) => void;

export enum RecordType {
  MANIFEST = 1,
  EXAM = 2,
  EXERCISE = 3,
  STUDENT = 4,
  SUBMISSION = 5,
  AUDITLOG = 6,
  EXERCISESCORE = 7,
  EXAMEXERCISE = 8,
  EXERCISERESOURCE = 9,
}

export interface ArchiveManifest {
  version: string;
  created_at: string;
  expires_at: string;
  mode: 'local' | 'hybrid';
  exam_count: number;
  student_count: number;
  records_checksum: string;
}

export interface ArchiveRecord {
  type: RecordType;
  payload: Uint8Array;
}

export interface ProgressEventData {
  stage: 'salt' | 'encrypt' | 'compress' | 'writing' | 'unpacking' | 'verifying' | 'complete';
  current: number;
  total: number;
  heapUsedMB?: number;
}
