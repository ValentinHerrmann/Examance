import { ensure64CharHex } from '$lib/crypto/hmac';
import type { StudentRecord, SubmissionRecord } from '$lib/db/schema';

/**
 * Builds a Map mapping all identifier variations of submissions and students
 * (raw pseudonymId, 64-char SHA256 HMAC hex, fallbackCode, submission ID)
 * to the corresponding SubmissionRecord.
 */
export async function buildSubmissionMap(
  submissions: SubmissionRecord[],
  students: StudentRecord[] = []
): Promise<Map<string, SubmissionRecord>> {
  const map = new Map<string, SubmissionRecord>();

  // 1. Initial pass: map submission's own pseudonymHash and id directly
  for (const s of submissions) {
    if (s.pseudonymHash) {
      map.set(s.pseudonymHash, s);
    }
    if (s.id) {
      map.set(s.id, s);
    }
  }

  // 2. Compute 64-char SHA-256 HMAC for submission keys
  for (const s of submissions) {
    if (s.pseudonymHash) {
      const hex = await ensure64CharHex(s.pseudonymHash);
      map.set(hex, s);
    }
    if (s.id) {
      const hexId = await ensure64CharHex(s.id);
      map.set(hexId, s);
    }
  }

  // 3. Cross-map student pseudonymId and fallbackCode to matched submission
  for (const st of students) {
    if (!st) continue;

    let sub: SubmissionRecord | undefined;
    if (st.pseudonymId) {
      sub = map.get(st.pseudonymId);
      if (!sub) {
        const hex = await ensure64CharHex(st.pseudonymId);
        sub = map.get(hex);
      }
    }

    if (!sub && st.fallbackCode) {
      sub = map.get(st.fallbackCode);
      if (!sub) {
        const hex = await ensure64CharHex(st.fallbackCode);
        sub = map.get(hex);
      }
    }

    if (sub) {
      if (st.pseudonymId) {
        map.set(st.pseudonymId, sub);
      }
      if (st.fallbackCode) {
        map.set(st.fallbackCode, sub);
      }
    }
  }

  return map;
}
