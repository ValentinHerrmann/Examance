import { getLatestForSlot } from '#lib/latex/compileCache';
import { compileFailure, type CompileFailure } from '#lib/latex/compileError';
import { compileExercisePreview, type ExercisePreviewInput } from '#lib/latex/exercisePreview';
import { pdfBytesToUrl } from '#lib/latex/pdfPreview';
import { translate } from '#lib/i18n';

type PreviewInput = Omit<ExercisePreviewInput, 'onAngabe'>;

/** The exercise editor's compile preview: the two PDFs as object URLs, which panes are open, and the last compile's failure (sent with a layout report). The editor owns one and calls `cleanup()` when it closes. */
export class EditorPreview {
  loading = $state(false);
  pdfUrl: string | null = $state(null);
  solutionUrl: string | null = $state(null);
  // Both panes start collapsed: there is nothing to preview until the user compiles.
  showAngabe = $state(false);
  showLoesung = $state(false);
  error = $state('');
  log = $state<CompileFailure | null>(null);
  /** Whether a compile ran in this editor session; the live preview starts only after the first one. */
  compiled = $state(false);
  /** The newest source asked for while a compile ran; only it compiles next, so a stale result never shows last. */
  private queued: { input: PreviewInput; done: ((message: string) => void)[] } | null = null;
  private running = false;

  /** Revokes the object URLs; the panes keep their open state. */
  cleanup(): void {
    if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl);
    if (this.solutionUrl) URL.revokeObjectURL(this.solutionUrl);
    this.pdfUrl = null;
    this.solutionUrl = null;
  }

  /** A fresh editor session: panes closed, the last compile of a stored exercise shown again from the in-memory cache. */
  restore(exerciseId: string | undefined): void {
    this.cleanup();
    this.compiled = false;
    this.showAngabe = false;
    this.showLoesung = false;
    if (!exerciseId) return;
    const angabe = getLatestForSlot({ kind: 'exercise', id: exerciseId, variant: 'angabe' });
    if (angabe) this.pdfUrl = pdfBytesToUrl(angabe.pdfBytes);
    const loesung = getLatestForSlot({ kind: 'exercise', id: exerciseId, variant: 'loesung' });
    if (loesung) this.solutionUrl = pdfBytesToUrl(loesung.pdfBytes);
  }

  private setPdf(bytes: Uint8Array): void {
    if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl);
    this.pdfUrl = pdfBytesToUrl(bytes);
  }

  /** Compiles task sheet and solution, or, while one runs, after it with the newest input only; resolves to the message for the editor's error line ("" when all went well). */
  compile(input: PreviewInput): Promise<string> {
    return new Promise((resolve) => {
      if (this.queued) this.queued = { input, done: [...this.queued.done, resolve] };
      else this.queued = { input, done: [resolve] };
      if (!this.running) void this.drain();
    });
  }

  private async drain(): Promise<void> {
    this.running = true;
    try {
      while (this.queued) {
        const { input, done } = this.queued;
        this.queued = null;
        const message = await this.compileNow(input);
        for (const d of done) d(message);
      }
    } finally {
      this.running = false;
    }
  }

  private async compileNow(input: PreviewInput): Promise<string> {
    this.compiled = true;
    this.loading = true;
    this.error = '';
    this.log = null;
    let angabeShown = false;
    try {
      const res = await compileExercisePreview({
        ...input,
        onAngabe: (angabe) => {
          this.setPdf(angabe.pdfBytes);
          angabeShown = true;
          this.showAngabe = true;
        },
      });
      if (!angabeShown) this.setPdf(res.angabe.pdfBytes);
      if (this.solutionUrl) URL.revokeObjectURL(this.solutionUrl);
      this.solutionUrl = pdfBytesToUrl(res.loesung.pdfBytes);
      // Now that a PDF exists, open the task-sheet pane so the result is actually visible.
      this.showAngabe = true;
      // A missing figure does not fail the engine: say so instead of handing back a PDF with a silent hole in it.
      return res.missingGraphics.length > 0 ? translate('common.previewMissingGraphic', { name: res.missingGraphics[0] }) : '';
    } catch (err) {
      console.error('Exercise preview failed:', err);
      const message = err instanceof Error && err.message ? err.message : translate('exercises.editor.previewFailedUnknown');
      this.error = translate('exercises.editor.previewFailed', { message });
      this.log = compileFailure(err);
      return this.error;
    } finally {
      this.loading = false;
    }
  }
}
