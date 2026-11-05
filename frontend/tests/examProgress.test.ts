import { describe, expect, it } from 'vitest';
import { continueStep, examProgress, nextStep } from '../src/lib/exam/examProgress';
import { stepNumber } from '../src/lib/components/layout/examNavItems';

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
    expect(stepNumber('print')).toBe('3');
    expect(stepNumber('scan')).toBe('4A');
    expect(stepNumber('grade')).toBe('6A');
    expect(stepNumber('manual')).toBe('B');
    expect(stepNumber('results')).toBe('7');
  });
});
