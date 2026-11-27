import { getLatestForSlot } from '#lib/latex/compileCache';
import { compileFailure, type CompileFailure } from '#lib/latex/compileError';
import { compileExercisePreview, type ExercisePreviewInput } from '#lib/latex/exercisePreview';
import { pdfBytesToUrl } from '#lib/latex/pdfPreview';
import { translate } from '#lib/i18n';
import { PreviewSync } from '#lib/latex/previewSync.svelte';
import type { ClickTarget, PageClick } from '#lib/latex/clickToSource';
import type { PageEditProps } from '#lib/components/latex/PageEditLayer.svelte';
import type { EditorKey, EditorPos } from '#lib/components/LatexEditor.svelte';

type PreviewInput = Omit<ExercisePreviewInput, 'onAngabe'>;
/** The part of `LatexEditor` the pages drive. */
export interface CursorTarget {
  setCursor(line: number, column?: number, focus?: boolean): void;
  setSelection(anchor: EditorPos, head: EditorPos, focus?: boolean): void;
  replaceSelection(text: string): void;
  runKey(key: EditorKey, extend?: boolean): boolean;
}

const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/** The live preview compiles at once on an edit (the queue keeps only the newest source waiting, so fast typing skips versions); devices with 4 GB or less, where the worker also keeps fewer sessions, wait a moment so a typing burst costs one compile (issue #347). */
const LIVE_DELAY_MS = ((globalThis.navigator as { deviceMemory?: number } | undefined)?.deviceMemory ?? 8) <= 4 ? 300 : 0;

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
  /** Click-to-source and the editor's cursor in both panes (issue #347). */
  readonly sync = new PreviewSync();
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

  /** Live preview: `run` compiles `LIVE_DELAY_MS` (usually 0) after the last change of `key` while `on`; the key when it came on (the editor opened, the first compile ran) is the baseline, so only edits after it compile. */
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

  /** The editor's selection moved or its text changed: the caret and selection in the pages follow. */
  cursor(selection: { anchor: EditorPos; head: EditorPos }, body: () => string): void {
    this.sync.select({ exerciseId: null, ...selection }, () => body());
  }

  /** What pane `paneId` does with clicks and keys (issue #347). With the engine's glyph positions the pages are an editor: a click puts the caret there, a double click selects the word, a triple click the line, a drag selects, and typing goes into `editor()` (the body's LaTeX editor; none for MC, which only gets the template tooltip). Without them a click moves the code editor's cursor and focuses it. */
  pageEdit(paneId: string, editor: () => CursorTarget | undefined, body: () => string): PageEditProps {
    const inline = this.sync.editable(paneId) && editor() !== undefined;
    return {
      marks: this.sync.marks[paneId] ?? null,
      onClick: (click, count) => void this.pageClick(paneId, click, count, inline, editor, body),
      onDrag: inline ? (from, to) => void this.pageDrag(paneId, from, to, editor, body) : undefined,
      onText: inline ? (text) => editor()?.replaceSelection(text) : undefined,
      onKey: inline ? (key, shift) => editor()?.runKey(key, shift) ?? false : undefined,
    };
  }

  private async pageClick(paneId: string, click: PageClick, count: number, inline: boolean, editor: () => CursorTarget | undefined, body: () => string): Promise<void> {
    const target = await this.sync.click(paneId, click, () => body());
    const ed = editor();
    if (target?.kind !== 'source' || !ed) return;
    const at = { line: target.line, column: target.column };
    if (!inline) return ed.setCursor(at.line, at.column);
    const text = body().split('\n')[at.line - 1] ?? '';
    if (count >= 3) return ed.setSelection({ line: at.line, column: 0 }, { line: at.line, column: text.length });
    if (count === 2) {
      let from = at.column;
      let to = at.column;
      while (from > 0 && isWordChar(text[from - 1])) from--;
      while (to < text.length && isWordChar(text[to])) to++;
      return ed.setSelection({ line: at.line, column: from }, { line: at.line, column: to });
    }
    ed.setSelection(at, at);
  }

  private async pageDrag(paneId: string, from: PageClick, to: PageClick, editor: () => CursorTarget | undefined, body: () => string): Promise<void> {
    const [a, b] = await Promise.all([this.sync.click(paneId, from, () => body(), false), this.sync.click(paneId, to, () => body(), false)]);
    const src = (t: ClickTarget | null) => (t?.kind === 'source' ? { line: t.line, column: t.column } : null);
    const anchor = src(a);
    const head = src(b);
    if (anchor && head) editor()?.setSelection(anchor, head);
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
      return this.error;
    } finally {
      this.loading = false;
    }
  }
}
