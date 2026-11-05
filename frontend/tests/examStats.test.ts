import { describe, expect, it } from 'vitest';
import type { SubmissionRecord } from '../src/lib/db/schema';
import { computeExamStats } from '../src/lib/utils/examStats';

const sub = (examId: string, totalScore?: number) => ({ id: crypto.randomUUID(), examId, totalScore }) as unknown as SubmissionRecord;

describe('computeExamStats', () => {
  it('counts ungraded scans too, so the delete warning names every submission', () => {
    const stats = computeExamStats([sub('a', 10), sub('a'), sub('a'), sub('b')]);
    expect(stats.get('a')).toEqual({ avgScore: 10, count: 1, submissionCount: 3 });
    expect(stats.get('b')).toEqual({ avgScore: null, count: 0, submissionCount: 1 });
  });
});
