import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExerciseRecord } from '../src/lib/db/schema';

const writeExercise = vi.fn(async (base: ExerciseRecord) => ({ ...base }));
const commit = vi.fn();
const stagedSignature = vi.fn(async () => 'files-v2');
vi.mock('../src/lib/exercise-library/exerciseEditorSave', async (orig) => ({
  ...(await orig<typeof import('../src/lib/exercise-library/exerciseEditorSave')>()),
  writeExercise: (base: ExerciseRecord) => writeExercise(base),
  cascadeGroupMetadata: vi.fn(async () => {}),
}));
vi.mock('../src/lib/repositories/exerciseResourceRepository', () => ({
  exerciseResourceRepository: {
    commit: (...args: unknown[]) => commit(...args),
    stagedSignature: () => stagedSignature(),
    seedStaging: vi.fn(async () => {}),
  },
}));
vi.mock('../src/lib/exercise-library/askToShare', () => ({ askToShare: vi.fn() }));

const { EditorSession } = await import('../src/lib/exercise-library/editorSession.svelte');

const base = { id: 'ex1', name: 'Aufgabe', latexBody: 'x' } as ExerciseRecord;
const draft = { name: 'Aufgabe', topicTag: '_General', grade: '', subject: '', variantKey: '', latexBody: 'y', questionType: 'free_text' as const, penalty: 0.5 };

function session(editKey: { value: string }) {
  return new EditorSession({
    isOpen: () => true,
    editing: () => base,
    editKey: () => editKey.value,
    draft: () => draft,
    rememberSuggestions: () => {},
  });
}

describe('EditorSession autosave (issue #232, #298)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps the edit unsaved when the file upload failed, and saves it once the files arrive', async () => {
    const key = { value: 'k0' };
    const s = session(key);
    // The session starts with files v1; a figure added since makes them v2.
    stagedSignature.mockResolvedValueOnce('files-v1');
    s.start(base, 'k0');
    key.value = 'k1';
    commit.mockResolvedValueOnce({ errors: ['fig.png: offline'] });
    await s.autosave.flush();
    expect(s.savedKey).toBe('k0');
    commit.mockResolvedValueOnce({ errors: [] });
    await s.autosave.flush();
    expect(s.savedKey).toBe('k1');
    expect(writeExercise).toHaveBeenCalledTimes(2);
  });

  it('writes nothing once the session has finished', async () => {
    const key = { value: 'k0' };
    const s = session(key);
    s.start(base, 'k0');
    await s.finish();
    key.value = 'k1';
    await s.autosave.flush();
    expect(writeExercise).not.toHaveBeenCalled();
  });
});
