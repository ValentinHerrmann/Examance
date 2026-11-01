import { joinKey, keyFromRaw } from '#lib/crypto/pseudonymKey';
import type { StudentRecord, SubmissionRecord } from '#lib/db/schema';

/** Maps each student's stored `pseudonymHmac` and fallback code, and each submission's own value and id, to the submission. Rows meet on `joinKey`, so a student and a submission stored at different pseudonym versions still match; older builds also linked a student by its fallback code or by a submission's id, which stays. */
export async function buildSubmissionMap(
  submissions: SubmissionRecord[],
  students: StudentRecord[] = []
): Promise<Map<string, SubmissionRecord>> {
  const present = students.filter(Boolean);
  const none = Promise.resolve(null);
  // Every key at once: each is an independent HMAC.
  const [subKeys, idKeys, studentKeys, fallbackKeys] = await Promise.all([
    Promise.all(submissions.map((s) => (s.pseudonymHmac ? joinKey(s) : none))),
    Promise.all(submissions.map((s) => (s.id ? keyFromRaw(s.examId, s.id) : none))),
    Promise.all(present.map((st) => (st.pseudonymHmac ? joinKey(st) : none))),
    Promise.all(present.map((st) => (st.fallbackCode ? keyFromRaw(st.examId, st.fallbackCode) : none))),
  ]);

  const map = new Map<string, SubmissionRecord>();
  const byJoin = new Map<string, SubmissionRecord>();
  submissions.forEach((s, i) => {
    if (s.pseudonymHmac) {
      map.set(s.pseudonymHmac, s);
      byJoin.set(subKeys[i]!, s);
    }
    if (s.id) {
      map.set(s.id, s);
      if (!byJoin.has(idKeys[i]!)) byJoin.set(idKeys[i]!, s);
    }
  });

  present.forEach((st, i) => {
    let sub = studentKeys[i] ? byJoin.get(studentKeys[i]!) : undefined;
    if (!sub && st.fallbackCode) sub = map.get(st.fallbackCode) ?? byJoin.get(fallbackKeys[i]!);
    if (sub) {
      if (st.pseudonymHmac) map.set(st.pseudonymHmac, sub);
      if (st.fallbackCode) map.set(st.fallbackCode, sub);
    }
  });

  return map;
}
