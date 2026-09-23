import { describe, expect, it } from 'vitest';
import {
  applyResolutions,
  applyToAll,
  type ArchiveConflict,
  type DecisionMap,
} from '../src/lib/archive/conflicts';

const conflict = (
  kind: ArchiveConflict['kind'],
  id: string,
  allowCopy = true
): ArchiveConflict => ({
  kind,
  id,
  title: id,
  fields: [],
  allowCopy,
});

const payload = () => ({
  exams: [{ id: 'exam-1', title: 'Old' }],
  exercises: [{ id: 'ex-1', examId: 'exam-1', name: 'Q1' }],
  examMcGroups: [{ id: 'grp-1', examId: 'exam-1', title: 'MC' }],
  exerciseExams: [
    { examId: 'exam-1', exerciseId: 'ex-1', orderIndex: 1, mcGroupId: 'grp-1', subIndex: 0 },
  ],
  students: [{ pseudonymId: 'stu-1', examId: 'exam-1' }],
  submissions: [{ id: 'sub-1', examId: 'exam-1', pseudonymHash: 'abc' }],
  exerciseScores: [{ id: 'sc-1', submissionId: 'sub-1', exerciseId: 'ex-1' }],
  exerciseResources: [{ id: 'res-1', exerciseId: 'ex-1', filename: 'fig.png' }],
});

describe('applyToAll', () => {
  it('downgrades import-as-copy to keep-existing where a copy is not allowed', () => {
    // Two rows for one pupil is a data-protection problem, not a convenience.
    const decisions = applyToAll(
      [conflict('exam', 'exam-1'), conflict('student', 'stu-1', false)],
      'import-as-copy'
    );
    expect(decisions.get('exam-1')?.choice).toBe('import-as-copy');
    expect(decisions.get('stu-1')?.choice).toBe('keep-existing');
  });
});

describe('applyResolutions', () => {
  it('drops the records the teacher chose to keep', () => {
    const decisions: DecisionMap = new Map([
      ['exam-1', { id: 'exam-1', kind: 'exam', choice: 'keep-existing' }],
    ]);
    const { payload: next } = applyResolutions(payload(), decisions);

    expect(next.exams).toHaveLength(0);
    // The exam's junction goes with it rather than pointing at nothing.
    expect(next.exerciseExams).toHaveLength(0);
  });

  it('takes the imported version without changing ids', () => {
    const decisions: DecisionMap = new Map([
      ['exam-1', { id: 'exam-1', kind: 'exam', choice: 'take-imported' }],
    ]);
    const { payload: next, idMap } = applyResolutions(payload(), decisions);

    expect(next.exams[0].id).toBe('exam-1');
    expect(idMap.size).toBe(0);
  });

  it('mints one new id for a copy and carries it through every reference', () => {
    // The old serverImport retried a 409 under a fresh UUID the rest of the
    // import never learned about, which is how duplicates appeared unlinked.
    const decisions: DecisionMap = new Map([
      ['exam-1', { id: 'exam-1', kind: 'exam', choice: 'import-as-copy' }],
    ]);
    const { payload: next, idMap } = applyResolutions(payload(), decisions);

    const newId = idMap.get('exam-1');
    expect(newId).toBeTruthy();
    expect(newId).not.toBe('exam-1');
    expect(next.exams[0].id).toBe(newId);
    expect(next.exercises[0].examId).toBe(newId);
    expect(next.examMcGroups[0].examId).toBe(newId);
    expect(next.exerciseExams[0].examId).toBe(newId);
    expect(next.students[0].examId).toBe(newId);
    expect(next.submissions[0].examId).toBe(newId);
  });

  it('keeps a kept submission from dragging the archive scores in with it', () => {
    const decisions: DecisionMap = new Map([
      ['sub-1', { id: 'sub-1', kind: 'submission', choice: 'keep-existing' }],
    ]);
    const { payload: next } = applyResolutions(payload(), decisions);

    expect(next.submissions).toHaveLength(0);
    // The existing submission keeps its own scores; the archive's would be a
    // second set for a submission that is not being replaced.
    expect(next.exerciseScores).toHaveLength(0);
  });

  it('matches resources on exercise and filename, not on id', () => {
    const decisions: DecisionMap = new Map([
      ['ex-1:fig.png', { id: 'ex-1:fig.png', kind: 'resource', choice: 'keep-existing' }],
    ]);
    const { payload: next } = applyResolutions(payload(), decisions);
    expect(next.exerciseResources).toHaveLength(0);
  });

  it('passes everything through untouched when there are no decisions', () => {
    const { payload: next, idMap, skipped } = applyResolutions(payload(), new Map());
    expect(next.exams).toHaveLength(1);
    expect(next.exerciseScores).toHaveLength(1);
    expect(idMap.size).toBe(0);
    expect(skipped.size).toBe(0);
  });
});
