import { describe, expect, it, vi } from 'vitest';

const compileExercisePreview = vi.fn();
vi.mock('../src/lib/latex/exercisePreview', () => ({ compileExercisePreview: (input: unknown) => compileExercisePreview(input) }));
vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));

const { EditorPreview } = await import('../src/lib/exercise-library/editorPreview.svelte');

const input = { cacheId: 'c', name: 'A', latexBody: 'x', resourceOwnerId: 's', staged: true, useLocal: true, key: null };
const pdf = { pdfBytes: new Uint8Array([1]) };

describe('EditorPreview (issue #300)', () => {
  it('resolves no message for a clean compile and opens the task-sheet pane', async () => {
    compileExercisePreview.mockResolvedValueOnce({ angabe: pdf, loesung: pdf, missingGraphics: [] });
    const preview = new EditorPreview();
    await expect(preview.compile(input)).resolves.toBe('');
    expect(preview.showAngabe).toBe(true);
    expect(preview.pdfUrl).toBe('blob:x');
    expect(preview.error).toBe('');
  });

  it('resolves the failure message and keeps it for a layout report', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    compileExercisePreview.mockRejectedValueOnce(new Error('Undefined control sequence'));
    const preview = new EditorPreview();
    const message = await preview.compile(input);
    expect(message).toContain('Undefined control sequence');
    expect(preview.error).toBe(message);
    expect(preview.loading).toBe(false);
  });
});
