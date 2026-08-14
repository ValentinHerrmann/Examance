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
      compilationStatus: 'completed',
      createdAt: '2026-08-14T00:00:00.000Z',
    };

    const payload = mapExamRecordToApi(record);
    expect(payload.id).toBe('ex-123');
    expect(payload.grade).toBe('10');
    expect(payload.klasse).toBe('a');
    expect(payload.info_text).toBe('Calculator allowed');
    expect(payload.grading_key).toEqual({ preset: 'linear_40', cutoffs: [] });
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
      compilationStatus: 'pending',
      createdAt: '2026-08-14T00:00:00.000Z',
    };

    await examRepository.save(exam, null);

    expect(api.patch).toHaveBeenCalledWith('/exams/exam-99', expect.objectContaining({
      id: 'exam-99',
      title: 'Updated Exam Title',
      grade: '10',
      klasse: 'b',
    }));
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
      compilationStatus: 'pending',
      createdAt: '2026-08-14T00:00:00.000Z',
    };

    await examRepository.save(exam, null);

    expect(api.post).toHaveBeenCalledWith('/exams', expect.objectContaining({
      title: 'New Exam Title',
      grade: '9',
      klasse: 'c',
    }));
    expect(api.patch).not.toHaveBeenCalled();
  });
});
