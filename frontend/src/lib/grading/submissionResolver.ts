import type { SubmissionRecord } from '#lib/db/schema';
import { createKeyedOnce } from '#lib/utils/keyedOnce';

/** Finds or creates a student's submission for a score save (issue #298): one creation per pseudonym even for quick saves, and a map rebuilt from an older submission list keeps the submissions created here, so a later save never creates a second one. */
export function createSubmissionResolver<S extends { pseudonymHmac: string }>(create: (student: S) => Promise<SubmissionRecord>) {
  const once = createKeyedOnce<SubmissionRecord>();
  const created = new Map<string, SubmissionRecord>();
  return {
    /** The known submission, else the one created for this pseudonym (at most once). */
    resolve(student: S, known: ReadonlyMap<string, SubmissionRecord>): Promise<SubmissionRecord> {
      const { pseudonymHmac } = student;
      const found = known.get(pseudonymHmac) ?? created.get(pseudonymHmac);
      if (found) return Promise.resolve(found);
      return once.run(pseudonymHmac, async () => {
        const sub = await create(student);
        created.set(pseudonymHmac, sub);
        return sub;
      });
    },
    /** A rebuilt map plus every submission created here that it lacks. */
    merge(rebuilt: Map<string, SubmissionRecord>): Map<string, SubmissionRecord> {
      const missing = [...created].filter(([hmac]) => !rebuilt.has(hmac));
      if (missing.length === 0) return rebuilt;
      const merged = new Map(rebuilt);
      for (const [hmac, sub] of missing) merged.set(hmac, sub);
      return merged;
    },
  };
}
