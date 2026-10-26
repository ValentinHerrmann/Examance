import { describe, expect, it } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { isZip, readZipExport } from '../src/lib/archive/zipImport';

const zip = (files: Record<string, string | Uint8Array>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([p, c]) => [p, typeof c === 'string' ? strToU8(c) : c])));

const entry = (path: string, extra: Record<string, unknown> = {}) => ({
  name: 'Bruchrechnen',
  topic: null,
  grade: null,
  subject: null,
  questionType: 'free_text',
  options: [],
  correctAnswers: [],
  penalty: 0,
  maxPoints: 3,
  path,
  texFile: `${path}/exercise.tex`,
  resources: ['fig.png'],
  pdfs: [],
  ...extra,
});

describe('readZipExport', () => {
  it('recognises ZIP files by their signature', () => {
    expect(isZip(zip({ 'a.txt': 'x' }))).toBe(true);
    expect(isZip(strToU8('BGPROJ'))).toBe(false);
  });

  it('reads an exam ZIP: exam settings, exercises with files, links and MC groups, but no retention date', () => {
    const manifest = {
      generator: 'Examance',
      kind: 'exam',
      formatVersion: 1,
      exportedAt: '2026-10-26T00:00:00Z',
      exam: { id: 'exam-1', title: 'Probe', pageBreaks: ['ex-1'], extraNotes: null, nameLine: true },
      exercises: [entry('exercises/Bruchrechnen', { id: 'ex-1', exerciseGroupId: 'grp-1' })],
      links: [{ exerciseId: 'ex-1', orderIndex: 1, mcGroupId: null, subIndex: null }],
      mcGroups: [{ id: 'mc-1', title: 'MC', scoringText: '', orderIndex: 2 }],
    };
    const payload = readZipExport(
      zip({
        'manifest.json': JSON.stringify(manifest),
        'exercises/Bruchrechnen/exercise.tex': '\\begin{Aufgabe}x\\end{Aufgabe}',
        'exercises/Bruchrechnen/fig.png': new Uint8Array([1, 2, 3]),
        'pdf/exam.pdf': new Uint8Array([9]),
      })
    );

    expect(payload.exams).toHaveLength(1);
    expect(payload.exams[0]).toMatchObject({ id: 'exam-1', title: 'Probe', nameLine: true, pageBreaks: ['ex-1'] });
    expect(payload.exams[0].retentionUntil).toBeUndefined();
    expect(payload.exercises[0]).toMatchObject({ id: 'ex-1', name: 'Bruchrechnen', exerciseGroupId: 'grp-1', latexBody: '\\begin{Aufgabe}x\\end{Aufgabe}' });
    expect(payload.exerciseResources).toEqual([expect.objectContaining({ exerciseId: 'ex-1', filename: 'fig.png', dataB64: 'AQID' })]);
    expect(payload.exerciseExams).toEqual([expect.objectContaining({ examId: 'exam-1', exerciseId: 'ex-1' })]);
    expect(payload.examMcGroups).toEqual([expect.objectContaining({ id: 'mc-1', examId: 'exam-1' })]);
    expect(payload.students).toEqual([]);
  });

  it('keeps the variants of a group together in a library ZIP made before ids were written', () => {
    const manifest = {
      generator: 'Examance',
      exportedAt: '2026-01-01T00:00:00Z',
      groups: [
        {
          name: 'Brüche',
          path: 'Brueche',
          texFile: 'Brueche.tex',
          variants: [
            { key: '_General', exercises: [entry('Brueche/general/A', { resources: [] })] },
            { key: 'B', exercises: [entry('Brueche/B/A', { resources: [] })] },
          ],
        },
      ],
    };
    const payload = readZipExport(
      zip({
        'manifest.json': JSON.stringify(manifest),
        'Brueche/general/A/exercise.tex': 'a',
        'Brueche/B/A/exercise.tex': 'b',
      })
    );

    expect(payload.exercises).toHaveLength(2);
    const [general, b] = payload.exercises;
    expect(general.exerciseGroupId).toBe(b.exerciseGroupId);
    expect(general.variantKey).toBeUndefined();
    expect(b.variantKey).toBe('B');
    expect(general.id).not.toBe(b.id);
  });

  it('refuses a ZIP without manifest, naming how to export an importable one', () => {
    expect(() => readZipExport(zip({ 'main.tex': 'x' }))).toThrow();
  });
});
