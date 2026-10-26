import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/lib/latex/compileCache', () => ({
  compileWithCache: vi.fn(),
  getCachedFor: vi.fn(),
  getLatestForSlot: vi.fn(),
}));
vi.mock('../src/lib/repositories/exerciseResourceRepository', () => ({ exerciseResourceRepository: {} }));
vi.mock('../src/lib/latex/packageSettings', () => ({ getAccountPackages: vi.fn().mockResolvedValue([]) }));

import { buildExamLatex } from '../src/lib/exam/examPreview';
import type { ExamRecord } from '../src/lib/db/schema';

const base = { id: 'e1', teacherId: 't', retentionUntil: '2030-01-01', compilationStatus: 'pending', createdAt: '' } as ExamRecord;

describe('buildExamLatex extra notes', () => {
  it('ends the body with \\ExamNotes, after the exercises', () => {
    const exam = { ...base, extraNotes: { title: 'Platz & mehr_', minHeightCm: 4, maxHeightCm: 12 } };
    const tex = buildExamLatex(exam, '\\Aufgabe{X}', 'sans,punkte', []);
    const macro = '\\ExamNotes{Platz \\& mehr\\_}{4}{12}';
    expect(tex).toContain(macro);
    expect(tex.indexOf(macro)).toBeGreaterThan(tex.indexOf('\\Aufgabe{X}'));
    expect(tex.slice(tex.indexOf(macro) + macro.length).trim()).toBe('\\end{document}');
  });

  it('omits it when off', () => {
    expect(buildExamLatex({ ...base, extraNotes: null }, '', 'sans', [])).not.toContain('\\ExamNotes');
    expect(buildExamLatex(base, '', 'sans', [])).not.toContain('\\ExamNotes');
  });
});
