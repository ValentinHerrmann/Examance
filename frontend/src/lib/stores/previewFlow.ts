import { writable, type Readable } from "svelte/store";
import type { CompileKind } from "#lib/latex/compileCache";
import type { CompileResult } from "#lib/latex/compiler";
import { getCachedPreview, pdfBytesToUrl } from "#lib/latex/pdfPreview";
import { translate } from "#lib/i18n";

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
}

export interface PreviewFlow<T> extends Readable<PreviewState> {
  /** Shows the last compiled PDFs, or asks whether to compile when there are none. */
  open(item: T): void;
  confirm(): void;
  cancel(): void;
  close(): void;
  /** Revokes the object URLs; call when the owning component is destroyed. */
  destroy(): void;
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

  return {
    subscribe: store.subscribe,

    open(item) {
      reset();
      current = item;
      const title = options.titleOf(item);
      const cached = getCachedPreview(options.kind, options.idOf(item));
      if (cached.angabe || cached.loesung) {
        set({ phase: "open", title, angabeUrl: cached.angabe, loesungUrl: cached.loesung });
      } else {
        set({ phase: "ask", title });
      }
    },

    async confirm() {
      const item = current;
      if (item === null) return;
      const mine = ++token;
      set({ phase: "open", busy: true, notice: "", error: "" });
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
        set({ error: translate("common.previewFailed", { message: err?.message || "" }) });
      } finally {
        if (mine === token) set({ busy: false, loesungPending: false, notice: "" });
      }
    },

    cancel: reset,
    close: reset,
    destroy: reset,
  };
}
