import { getLatestForSlot } from '#lib/latex/compileCache';
import { compileFailure, type CompileFailure } from '#lib/latex/compileError';
import { compileExercisePreview, type ExercisePreviewInput } from '#lib/latex/exercisePreview';
import { pdfBytesToUrl } from '#lib/latex/pdfPreview';
import { translate } from '#lib/i18n';
import { PreviewSync } from '#lib/latex/previewSync.svelte';
import type { PageClick } from '#lib/latex/clickToSource';

type PreviewInput = Omit<ExercisePreviewInput, 'onAngabe'>;
/** The part of `LatexEditor` a jump needs. */
export type CursorTarget = { setCursor(line: number, column?: number): void };

/** The live preview waits this long after the last edit before it compiles. */
const LIVE_DELAY_MS = 300;

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
  /** Click-to-source and the provisional typing overlay of both panes (issue #347). */
  readonly sync = new PreviewSync();
  /** The body the shown PDFs were compiled from; the overlay shows what was typed since. */
  compiledBody = '';
  /** The newest source asked for while a compile ran; only it compiles next, so a stale result never shows last. */
  private queued: { input: PreviewInput; done: ((message: string) => void)[] } | null = null;
  private running = false;
  /** Bumped by `cleanup()` (close, a new editor session): a compile still running for the old one then shows nothing. */
  private generation = 0;
  private liveTimer: ReturnType<typeof setTimeout> | undefined;
  private liveKey = '';
  private lastMessage = '';

  /** Revokes the object URLs; the panes keep their open state. */
  cleanup(): void {
    this.stopLive();
    this.generation++;
    if (this.queued) for (const d of this.queued.done) d('');
    this.queued = null;
    this.sync.reset();
    this.compiledBody = '';
    if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl);
    if (this.solutionUrl) URL.revokeObjectURL(this.solutionUrl);
    this.pdfUrl = null;
    this.solutionUrl = null;
  }

  /** A fresh editor session: panes closed, the last compile of a stored exercise shown again from the in-memory cache. */
  restore(exerciseId: string | undefined): void {
    this.cleanup();
    this.compiled = false;
    this.lastMessage = '';
    this.showAngabe = false;
    this.showLoesung = false;
    if (!exerciseId) return;
    const angabe = getLatestForSlot({ kind: 'exercise', id: exerciseId, variant: 'angabe' });
    if (angabe) this.pdfUrl = pdfBytesToUrl(angabe.pdfBytes);
    const loesung = getLatestForSlot({ kind: 'exercise', id: exerciseId, variant: 'loesung' });
    if (loesung) this.solutionUrl = pdfBytesToUrl(loesung.pdfBytes);
  }

  /** The editor's error line after a compile's `message`: a failure or a missing figure writes it; a good compile clears only the preview's own last message, so one set meanwhile (a failed save) stays. */
  errorLine(current: string, message: string): string {
    const line = message || (current === this.lastMessage ? '' : current);
    this.lastMessage = message;
    return line;
  }

  /** Live preview: `run` compiles `LIVE_DELAY_MS` after the last change of `key` while `on`; the key when it came on (the editor opened, the first compile ran) is the baseline, so only edits after it compile. */
  live(key: string, on: boolean, run: () => void): void {
    const edited = this.liveKey !== '' && key !== this.liveKey;
    this.liveKey = on ? key : '';
    if (!on || !edited) return;
    this.stopLive();
    this.liveTimer = setTimeout(run, LIVE_DELAY_MS);
  }

  private stopLive(): void {
    clearTimeout(this.liveTimer);
    this.liveTimer = undefined;
  }

  /** A click on pane `paneId`: the cursor goes to that word in `editor` (the body's LaTeX editor; absent for MC, which only gets the template tooltip). */
  async jump(paneId: string, click: PageClick, body: string, editor: CursorTarget | undefined): Promise<void> {
    const target = await this.sync.click(paneId, click, () => body);
    if (target?.kind === 'source') editor?.setCursor(target.line, target.column);
  }

  /** An edit of the body: what was typed on the cursor's line shows on the pages until the next PDF. */
  typed(body: string, cursor: { line: number } | null | undefined): void {
    if (cursor && this.compiledBody) this.sync.provisional(null, this.compiledBody, body, cursor.line);
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
        const message = await this.compileNow(input); // NOSONAR: one compile at a time, then only the newest input
        for (const d of done) d(message);
      }
    } finally {
      this.running = false;
    }
  }

  private async compileNow(input: PreviewInput): Promise<string> {
    this.compiled = true;
    this.loading = true;
    let angabeShown = false;
    const generation = this.generation;
    const stale = () => generation !== this.generation;
    try {
      const res = await compileExercisePreview({
        ...input,
        onAngabe: (angabe) => {
          if (stale()) return;
          this.setPdf(angabe.pdfBytes);
          this.sync.setResult('angabe', angabe);
          angabeShown = true;
          this.showAngabe = true;
        },
      });
      if (stale()) return '';
      // The failure stays on screen until a compile succeeds, so a live recompile does not make its help flicker.
      this.error = '';
      this.log = null;
      if (!angabeShown) {
        this.setPdf(res.angabe.pdfBytes);
        this.sync.setResult('angabe', res.angabe);
      }
      if (this.solutionUrl) URL.revokeObjectURL(this.solutionUrl);
      this.solutionUrl = pdfBytesToUrl(res.loesung.pdfBytes);
      this.sync.setResult('loesung', res.loesung);
      this.compiledBody = input.latexBody;
      // Now that a PDF exists, open the task-sheet pane so the result is actually visible.
      this.showAngabe = true;
      // A missing figure does not fail the engine: say so instead of handing back a PDF with a silent hole in it.
      return res.missingGraphics.length > 0 ? translate('common.previewMissingGraphic', { name: res.missingGraphics[0] }) : '';
    } catch (err) {
      if (stale()) return '';
      console.error('Exercise preview failed:', err);
      const message = err instanceof Error && err.message ? err.message : translate('exercises.editor.previewFailedUnknown');
      this.error = translate('exercises.editor.previewFailed', { message });
      this.log = compileFailure(err);
      this.sync.clearOverlays();
      return this.error;
    } finally {
      this.loading = false;
    }
  }
}
