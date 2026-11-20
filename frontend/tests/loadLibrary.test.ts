import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExerciseRecord } from '../src/lib/db/schema';

const get = vi.fn();
const bulkPut = vi.fn(async (_rows: unknown[]) => {});
const loadExercisesEncrypted = vi.fn();
let serverBacked = true;
vi.mock('../src/lib/api/client', () => ({ api: { get: (...a: unknown[]) => get(...a) } }));
vi.mock('../src/lib/db/db', () => ({ db: { exercises: { bulkPut: (rows: unknown[]) => bulkPut(rows) } } }));
vi.mock('../src/lib/db/dbEncryption', () => ({
  encryptExercise: async (ex: ExerciseRecord) => ({ ...ex, sealed: true }),
  loadExercisesEncrypted: () => loadExercisesEncrypted(),
}));
vi.mock('../src/lib/repositories/exerciseRepository', () => ({ mapApiToExerciseRecord: (row: { id: string; code_withheld?: boolean }) => ({ id: row.id, codeWithheld: !!row.code_withheld }) }));
vi.mock('../src/lib/utils/serverBacked', () => ({ isServerBacked: () => serverBacked }));

const { loadLibraryExercises } = await import('../src/lib/exercise-library/loadLibrary');

describe('loadLibraryExercises', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    serverBacked = true;
  });

  it('reads the server, mirrors it and drops exercises without code', async () => {
    get.mockResolvedValueOnce([{ id: 'a' }, { id: 'b', code_withheld: true }]);
    const res = await loadLibraryExercises(null);
    expect(res).toEqual({ exercises: [{ id: 'a', codeWithheld: false }], localFallback: false });
    expect(bulkPut).toHaveBeenCalledTimes(1);
  });

  it('falls back to the local copy when the server cannot answer, still without withheld code', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    get.mockRejectedValueOnce(new Error('offline'));
    loadExercisesEncrypted.mockResolvedValueOnce([{ id: 'a' }, { id: 'b', codeWithheld: true }]);
    const res = await loadLibraryExercises(null);
    expect(res).toEqual({ exercises: [{ id: 'a' }], localFallback: true });
  });

  it('reads only the local copy when not server-backed', async () => {
    serverBacked = false;
    loadExercisesEncrypted.mockResolvedValueOnce([{ id: 'a' }]);
    expect(await loadLibraryExercises(null)).toEqual({ exercises: [{ id: 'a' }], localFallback: false });
    expect(get).not.toHaveBeenCalled();
  });
});
