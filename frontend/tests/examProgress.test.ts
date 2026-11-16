import { describe, expect, it } from 'vitest';
import { continueStep, examProgress, nextStep } from '../src/lib/exam/examProgress';
import { examNavItems, stepNumber } from '../src/lib/components/layout/examNavItems';

describe('examProgress', () => {
  it('leaves unknown counts out instead of showing 0', () => {
    const p = examProgress({ exerciseCount: 3 });
    expect(p.content).toEqual({ count: 3, done: true });
    expect(p.scan).toBeUndefined();
    expect(p.grade).toBeUndefined();
    expect(p.results).toBeUndefined();
  });

  it('marks grading done only when every submission is graded', () => {
    expect(examProgress({ submissionCount: 4, gradedCount: 3 }).grade).toEqual({ count: 3, total: 4, done: false });
    expect(examProgress({ submissionCount: 4, gradedCount: 4 }).grade?.done).toBe(true);
    expect(examProgress({ submissionCount: 0, gradedCount: 0 }).grade?.done).toBe(false);
  });

  it('reports results that did not arrive as an alert', () => {
    expect(examProgress({ sharedCount: 5, notReached: 2 }).results).toEqual({ count: 5, done: true, alert: 2 });
  });
});

describe('step order', () => {
  it('follows the sidebar order', () => {
    expect(nextStep('overview')).toBe('content');
    expect(nextStep('manual')).toBe('results');
    // Digital and paper grading are alternatives: Next after digital grading goes to Results.
    expect(nextStep('grade')).toBe('results');
    expect(nextStep('print')).toBe('scan');
    expect(nextStep('results')).toBeNull();
  });

  it('continues at the first unfinished step', () => {
    expect(continueStep(examProgress({ exerciseCount: 0 }))).toBe('content');
    expect(continueStep(examProgress({ exerciseCount: 2, studentCount: 20, print: { done: true }, submissionCount: 0, gradedCount: 0 }))).toBe('scan');
    expect(continueStep(examProgress({ exerciseCount: 2, print: { done: true }, submissionCount: 3, gradedCount: 1 }))).toBe('grade');
    expect(continueStep(examProgress({ exerciseCount: 2, studentCount: 3, print: { done: true }, submissionCount: 3, gradedCount: 3 }))).toBe('results');
  });
});

describe('step numbers', () => {
  it('numbers branch A with letters, B without a number, and counts on after A', () => {
    expect(stepNumber('overview')).toBeNull();
    expect(stepNumber('content')).toBe('1');
    expect(stepNumber('layout')).toBe('2');
    expect(stepNumber('students')).toBe('3');
    expect(stepNumber('print')).toBe('4');
    expect(stepNumber('scan')).toBe('5A');
    expect(stepNumber('verify')).toBe('6A');
    expect(stepNumber('grade')).toBe('7A');
    expect(stepNumber('manual')).toBe('B');
    expect(stepNumber('results')).toBe('8');
  });
});

describe('paper grading (digitalGrading false)', () => {
  it('goes from Layout to Students and from Print straight to Paper grading', () => {
    expect(nextStep('content')).toBe('layout');
    expect(nextStep('layout')).toBe('students');
    expect(nextStep('print', false)).toBe('manual');
    expect(nextStep('print', true)).toBe('scan');
    expect(nextStep('print')).toBe('scan');
  });

  it('greys out the scan branch A, never the other steps', () => {
    const items = examNavItems('e1', '/exam/e1', false);
    expect(items).toHaveLength(10);
    for (const item of items) {
      expect(item.disabledReason).toBe(item.branch === 'A' ? 'exam.layout.grading.off' : undefined);
    }
    expect(examNavItems('e1', '/exam/e1', true).every((i) => !i.disabledReason)).toBe(true);
    expect(examNavItems('e1', '/exam/e1').every((i) => !i.disabledReason)).toBe(true);
  });

  it('continues past the scan branch to Results once the earlier steps are done', () => {
    const progress = examProgress({ exerciseCount: 1, studentCount: 1, print: { done: true }, submissionCount: 0, gradedCount: 0 });
    expect(continueStep(progress)).toBe('scan');
    expect(continueStep(progress, false)).toBe('results');
  });
});
