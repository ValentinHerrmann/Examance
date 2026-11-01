import { joinKey, keyFromRaw } from '#lib/crypto/pseudonymKey';
import type { StudentRecord, SubmissionRecord } from '#lib/db/schema';

/** Maps each student's stored `pseudonymHmac` and fallback code, and each submission's own value and id, to the submission. Rows meet on `joinKey`, so a student and a submission stored at different pseudonym versions still match; older builds also linked a student by its fallback code or by a submission's id, which stays. */
export async function buildSubmissionMap(
  submissions: SubmissionRecord[],
  students: StudentRecord[] = []
): Promise<Map<string, SubmissionRecord>> {
  const map = new Map<string, SubmissionRecord>();
  const byJoin = new Map<string, SubmissionRecord>();

  for (const s of submissions) {
    if (s.pseudonymHmac) {
      map.set(s.pseudonymHmac, s);
      byJoin.set(await joinKey(s), s);
    }
    if (s.id) {
      map.set(s.id, s);
      const byId = await keyFromRaw(s.examId, s.id);
      if (!byJoin.has(byId)) byJoin.set(byId, s);
    }
  }

  for (const st of students) {
    if (!st) continue;
    let sub = st.pseudonymHmac ? byJoin.get(await joinKey(st)) : undefined;
    if (!sub && st.fallbackCode) {
      sub = map.get(st.fallbackCode) ?? byJoin.get(await keyFromRaw(st.examId, st.fallbackCode));
    }
    if (sub) {
      if (st.pseudonymHmac) map.set(st.pseudonymHmac, sub);
      if (st.fallbackCode) map.set(st.fallbackCode, sub);
    }
  }

  return map;
}
