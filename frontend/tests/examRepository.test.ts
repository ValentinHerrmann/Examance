import { describe, it, expect, vi, beforeEach } from 'vitest';
import { examRepository, mapApiToExamRecord, mapExamRecordToApi } from '../src/lib/repositories/examRepository';
import { api } from '../src/lib/api/client';
import { storagePolicyStore } from '../src/lib/stores/storagePolicy';
import type { ExamRecord } from '../src/lib/db/schema';

vi.mock('../src/lib/db/db', () => ({
  db: {
    exams: {
      toArray: vi.fn().mockResolvedValue([]),
      get: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('../src/lib/api/client', () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../src/lib/services/offlineQueue', () => ({
  enqueueRequest: vi.fn(),
}));

describe('examRepository mapping & saving', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storagePolicyStore.setPolicy({ storageMode: 'all-server', latexCompilation: 'server' });
  });

  it('maps API response to ExamRecord including grade, klasse and gradingKey', () => {
    const raw = {
      id: 'ex-123',
      teacher_id: 't-1',
      title: 'Math Test',
      testart: 'Schulaufgabe',
      grade: '10',
      klasse: 'a',
      datum: '14.08.2026',
      nr: '1',
      fach: 'Mathematik',
      lehrernachname: 'Müller',
      info_text: 'Calculator allowed',
      grading_key: { preset: 'linear_40', cutoffs: [] },
    };

    const record = mapApiToExamRecord(raw);
    expect(record.id).toBe('ex-123');
    expect(record.grade).toBe('10');
    expect(record.klasse).toBe('a');
    expect(record.infoText).toBe('Calculator allowed');
    expect(record.gradingKey).toEqual({ preset: 'linear_40', cutoffs: [] });
  });

  it('maps ExamRecord to API payload including grade, klasse and grading_key', () => {
    const record: ExamRecord = {
      id: 'ex-123',
      teacherId: 't-1',
      title: 'Math Test',
      testart: 'Schulaufgabe',
      grade: '10',
      klasse: 'a',
      datum: '14.08.2026',
      nr: '1',
      fach: 'Mathematik',
      lehrernachname: 'Müller',
      infoText: 'Calculator allowed',
      gradingKey: { preset: 'linear_40', cutoffs: [] },
      retentionUntil: '2027-08-14',
      compilationStatus: 'compiled',
      createdAt: '2026-08-14T00:00:00.000Z',
    };

    const payload = mapExamRecordToApi(record);
    expect(payload.id).toBe('ex-123');
    expect(payload.grade).toBe('10');
    expect(payload.klasse).toBe('a');
    expect(payload.info_text).toBe('Calculator allowed');
    expect(payload.grading_key).toEqual({ preset: 'linear_40', cutoffs: [] });
  });

  it('maps every ExamRecord field from a full API response (regression test for dropped fields on reload)', () => {
    const raw = {
      id: 'ex-full',
      teacher_id: 't-1',
      title: 'Full Exam',
      testart: 'Klausur',
      grade: '10',
      klasse: 'b',
      datum: '14.08.2026',
      nr: '2',
      fach: 'Mathematik',
      lehrernachname: 'Schmidt',
      info_text: 'No calculator',
      grading_key: { preset: 'linear_40', cutoffs: [{ minPercentage: 50, grade: '4' }] },
      latex_preamble: '\\usepackage{amsmath}',
      latex_template: '\\documentclass{article}',
      num_versions: 2,
      retention_until: '2027-08-14',
      compilation_status: 'compiled',
      created_at: '2026-08-01T00:00:00Z',
    };

    const mapped = mapApiToExamRecord(raw);

    expect(mapped.gradingKey).toEqual(raw.grading_key);
    expect(mapped.latexPreamble).toBe(raw.latex_preamble);
    expect(mapped.latexTemplate).toBe(raw.latex_template);
    expect(mapped.numVersions).toBe(raw.num_versions);
    expect(mapped.compilationStatus).toBe('compiled');
    expect(mapped.retentionUntil).toBe('2027-08-14');
  });

  it('getById maps grading_key from server response (guards against the [id] page reload bug)', async () => {
    storagePolicyStore.setPolicy({ storageMode: 'all-server', latexCompilation: 'server' });
    (api.get as any).mockResolvedValue({
      id: 'ex-1',
      teacher_id: 't-1',
      title: 'Test',
      grading_key: { preset: 'even_split', cutoffs: [] },
      retention_until: '2027-01-01',
      compilation_status: 'pending',
      created_at: '2026-01-01T00:00:00Z',
    });

    const exam = await examRepository.getById('ex-1', null);

    expect(exam?.gradingKey).toEqual({ preset: 'even_split', cutoffs: [] });
  });

  it('issues PATCH request for existing exam ID on save', async () => {
    (api.patch as any).mockResolvedValueOnce({ status: 'ok' });

    const exam: ExamRecord = {
      id: 'exam-99',
      teacherId: 't-1',
      title: 'Updated Exam Title',
      testart: 'Kurzarbeit',
      grade: '10',
      klasse: 'b',
      retentionUntil: '2027-08-14',
      compilationStatus: 'pending',
      createdAt: '2026-08-14T00:00:00.000Z',
    };

    await examRepository.save(exam, null);

    expect(api.patch).toHaveBeenCalledWith(
      '/exams/exam-99',
      expect.objectContaining({
        id: 'exam-99',
        title: 'Updated Exam Title',
        grade: '10',
        klasse: 'b',
      }),
      { silentError: true },
    );
    expect(api.post).not.toHaveBeenCalled();
  });

  it('issues POST request for new exam (without ID) on save', async () => {
    (api.post as any).mockResolvedValueOnce({ status: 'ok' });

    const exam: ExamRecord = {
      id: '',
      teacherId: 't-1',
      title: 'New Exam Title',
      testart: 'Kurzarbeit',
      grade: '9',
      klasse: 'c',
      retentionUntil: '2027-08-14',
      compilationStatus: 'pending',
      createdAt: '2026-08-14T00:00:00.000Z',
    };

    await examRepository.save(exam, null);

    expect(api.post).toHaveBeenCalledWith(
      '/exams',
      expect.objectContaining({
        title: 'New Exam Title',
        grade: '9',
        klasse: 'c',
      }),
      { silentError: true },
    );
    expect(api.patch).not.toHaveBeenCalled();
  });
});
