import { describe, it, expect } from 'vitest';
import { toRestoreReport } from '../src/lib/services/serverDataRestore';

// Issue #181: the restore must say which exams' older deleted results are already gone.
describe('toRestoreReport', () => {
  const answer = {
    restored_student_identities: 2,
    restored_submissions: 3,
    grace_days: 7,
    purged_exams: [
      { exam_id: 'AAAAAAAA-0000-0000-0000-000000000001', purged_at: '2026-10-01T03:00:00Z' },
      { exam_id: 'aaaaaaaa-0000-0000-0000-000000000002', purged_at: '2026-10-20T03:00:00Z' },
    ],
  };

  it('names purged exams from the exam list, newest erasure first, ids case-insensitive', () => {
    const report = toRestoreReport(answer, [
      { id: 'aaaaaaaa-0000-0000-0000-000000000001', title: 'Mathe 7a' },
      { id: 'aaaaaaaa-0000-0000-0000-000000000002', title: 'Physik 9b' },
    ]);
    expect(report).toEqual({
      students: 2,
      submissions: 3,
      graceDays: 7,
      purged: [
        { title: 'Physik 9b', purgedAt: '2026-10-20T03:00:00Z' },
        { title: 'Mathe 7a', purgedAt: '2026-10-01T03:00:00Z' },
      ],
    });
  });

  it('keeps an exam it cannot name, so nothing purged goes unreported', () => {
    const report = toRestoreReport(answer, []);
    expect(report.purged.map((p) => p.title)).toEqual([null, null]);
  });
});
