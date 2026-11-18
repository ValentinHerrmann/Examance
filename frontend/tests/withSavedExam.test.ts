import { describe, expect, it } from 'vitest';
import { withSavedExam } from '#lib/exam/saveExamLayout';
import type { ExamRecord } from '#lib/db/schema';

const exam = (id: string, title = id) => ({ id, title }) as ExamRecord;

describe('withSavedExam', () => {
  it('replaces the shown exam and keeps the rest of the context', () => {
    const ctx = { exam: exam('a'), exercises: ['x'] };
    expect(withSavedExam(ctx, exam('a', 'saved'))).toEqual({ exam: exam('a', 'saved'), exercises: ['x'] });
  });

  it('drops a save of another exam that lands after a switch', () => {
    expect(withSavedExam({ exam: exam('b'), exercises: [] }, exam('a'))).toBeNull();
    expect(withSavedExam(null, exam('a'))).toBeNull();
  });
});
