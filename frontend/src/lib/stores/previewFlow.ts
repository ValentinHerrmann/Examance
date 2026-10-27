import { writable, type Readable } from "svelte/store";
import { getLatestForSlot, type CompileKind } from "#lib/latex/compileCache";
import type { CompileResult } from "#lib/latex/compiler";
import { getCachedPreview, pdfBytesToUrl } from "#lib/latex/pdfPreview";
import { translate } from "#lib/i18n";
import { compileFailure, type CompileFailure } from "#lib/latex/compileError";
import type { LayoutReportFileData } from "#lib/api/layoutReports";

export interface PreviewState {
  /** `ask`: nothing cached, waiting for the compile confirmation; `open`: modal visible. */
  phase: "idle" | "ask" | "open";
  title: string;
  angabeUrl: string | null;
  loesungUrl: string | null;
  busy: boolean;
  /** The Angabe is shown, the Lösung is still compiling. */
  loesungPending: boolean;
  notice: string;
  error: string;
  /** The full LaTeX log (with source and engine) behind `error`, when the compile failed with one. */
  errorLog: CompileFailure | null;
}

export interface PreviewFlow<T> extends Readable<PreviewState> {
  /** Shows the last compiled PDFs (recompiling outdated ones when `cached` is given), or asks whether to compile. */
  open(item: T): void | Promise<void>;
  confirm(): void;
  cancel(): void;
  close(): void;
  /** Revokes the object URLs; call when the owning component is destroyed. */
  destroy(): void;
  /** Whether the modal offers the layout report (issue #134). */
  readonly reportable: boolean;
  /** The layout-report files of the shown item and PDFs. */
  reportFiles(): Promise<LayoutReportFileData[]>;
}

interface PreviewFlowOptions<T> {
  kind: Extract<CompileKind, "exam" | "exercise">;
  idOf: (item: T) => string;
  titleOf: (item: T) => string;
  compile: (
    item: T,
    onStatus: (status: string) => void,
    onAngabe: (angabe: CompileResult) => void
  ) => Promise<{ angabe: CompileResult; loesung: CompileResult; missingGraphics: string[] }>;
  /** Checks the cache against the item's current sources: "stale" recompiles right away (issue #135). Without it,
   *  the last compile is shown as is. */
  cached?: (item: T) => Promise<{ angabe: { pdfBytes: Uint8Array }; loesung: { pdfBytes: Uint8Array } } | "stale" | null>;
  /** Builds the layout-report files from the shown PDFs; without it the modal offers no report. */
  reportFiles?: (item: T, angabeUrl: string | null, loesungUrl: string | null) => Promise<LayoutReportFileData[]>;
}

const idle: PreviewState = {
  phase: "idle",
  title: "",
  angabeUrl: null,
  loesungUrl: null,
  busy: false,
  loesungPending: false,
  notice: "",
  error: "",
  errorLog: null,
};

/**
 * The Preview flow of the overview pages: show the last compile from the in-memory cache, else compile
 * in the modal. Owns the object URLs (every replacement, close and destroy revokes them); a compile
 * finishing after the modal closed is dropped.
 */
export function createPreviewFlow<T>(options: PreviewFlowOptions<T>): PreviewFlow<T> {
  const store = writable<PreviewState>(idle);
  let state = idle;
  let current: T | null = null;
  let token = 0;

  function set(patch: Partial<PreviewState>) {
    state = { ...state, ...patch };
    store.set(state);
  }

  function revokeUrls() {
    if (state.angabeUrl) URL.revokeObjectURL(state.angabeUrl);
    if (state.loesungUrl) URL.revokeObjectURL(state.loesungUrl);
    set({ angabeUrl: null, loesungUrl: null });
  }

  function reset() {
    token++;
    revokeUrls();
    current = null;
    state = idle;
    store.set(state);
  }

  async function confirm() {
    const item = current;
    if (item === null) return;
    const mine = ++token;
    set({ phase: "open", busy: true, notice: "", error: "", errorLog: null });
    // The Angabe is shown as soon as it exists; the Lösung compile (a second full run) follows behind it.
    let angabeShown = false;
    try {
      const res = await options.compile(
        item,
        (status) => {
          if (mine !== token) return;
          set({
            notice:
              status === "downloading"
                ? translate("exam.page.preview.loadingCompiler")
                : translate("common.previewCompiling"),
          });
        },
        (angabe) => {
          if (mine !== token) return;
          revokeUrls();
          angabeShown = true;
          set({ angabeUrl: pdfBytesToUrl(angabe.pdfBytes), busy: false, loesungPending: true, notice: "" });
        }
      );
      if (mine !== token) return;
      if (!angabeShown) {
        revokeUrls();
        set({ angabeUrl: pdfBytesToUrl(res.angabe.pdfBytes) });
      }
      set({
        loesungUrl: pdfBytesToUrl(res.loesung.pdfBytes),
        error: res.missingGraphics.length
          ? translate("common.previewMissingGraphic", { name: res.missingGraphics[0] })
          : "",
      });
    } catch (err: any) {
      if (mine !== token) return;
      set({ error: translate("common.previewFailed", { message: err?.message || "" }), errorLog: compileFailure(err) });
    } finally {
      if (mine === token) set({ busy: false, loesungPending: false, notice: "" });
    }
  }

  return {
    subscribe: store.subscribe,

    async open(item) {
      reset();
      current = item;
      const title = options.titleOf(item);
      const id = options.idOf(item);
      const hasSlot =
        getLatestForSlot({ kind: options.kind, id, variant: "angabe" }) ||
        getLatestForSlot({ kind: options.kind, id, variant: "loesung" });
      if (!hasSlot) {
        set({ phase: "ask", title });
        return;
      }
      if (options.cached) {
        const mine = token;
        set({ phase: "open", title, busy: true });
        let cached: Awaited<ReturnType<NonNullable<typeof options.cached>>> = null;
        try {
          cached = await options.cached(item);
        } catch {
          cached = null;
        }
        if (mine !== token) return;
        if (cached === "stale") {
          await confirm();
        } else if (cached) {
          set({
            busy: false,
            angabeUrl: pdfBytesToUrl(cached.angabe.pdfBytes),
            loesungUrl: pdfBytesToUrl(cached.loesung.pdfBytes),
          });
        } else {
          set({ phase: "ask", busy: false });
        }
        return;
      }
      const cached = getCachedPreview(options.kind, id);
      set({ phase: "open", title, angabeUrl: cached.angabe, loesungUrl: cached.loesung });
    },

    confirm,
    cancel: reset,
    close: reset,
    destroy: reset,

    reportable: options.reportFiles !== undefined,
    async reportFiles() {
      if (current === null || !options.reportFiles) return [];
      return options.reportFiles(current, state.angabeUrl, state.loesungUrl);
    },
  };
}
