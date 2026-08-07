/**
 * gradingStore — scoped exception to this codebase's normal "plain props" convention.
 *
 * WHY THIS EXISTS: the grading route (frontend/src/routes/exam/[id]/grade/+page.svelte)
 * manages a large amount of tightly-coupled, cross-cutting state (current submission
 * index, per-exercise scores, manual-override flags, active exercise/stamp target,
 * vector annotation strokes, canvas zoom/pan, PDF paging). Passing all of this down
 * through 15+ individual props to leaf components (ScanCanvasViewer, ScoreEntry,
 * AnnotationToolbar, ZoomPageControls, ...) would be unreadable and error-prone.
 *
 * Leaf grading components subscribe to this store directly via `$gradingStore` and
 * call the named setters below to mutate it. This is a DELIBERATE, SCOPED exception
 * for the grading feature only — it is not a new project-wide convention. Elsewhere
 * in this codebase, components take plain props and callback props
 * (`onAction={handler}`), per the established architecture rules.
 *
 * Async operations (loading a submission's scan/annotations, saving score +
 * annotations to IndexedDB/server) stay OWNED by the route, not by this store.
 * The route reads/writes store state (e.g. `get(gradingStore).currentStrokes`)
 * around those async calls, but the store itself holds no async logic.
 */

import { writable, get } from 'svelte/store';

export type ToolType =
  | 'pen'
  | 'line'
  | 'eraser'
  | 'check_full'
  | 'check_half'
  | 'check_quarter'
  | 'minus_full'
  | 'minus_half'
  | 'minus_quarter'
  | 'wrong'
  | 'missing'
  | 'wf'
  | 'ff'
  | 'cross'
  | 'check';

export interface VectorStroke {
  tool: ToolType;
  points: { x: number; y: number }[];
  color: string;
  exerciseId?: string;
  pageNumber?: number;
}

export interface GradingState {
  // Navigation / identity
  currentIndex: number;

  // Scoring
  scoreInputs: Record<string, number | null>;
  manualOverride: Record<string, boolean>;
  activeExerciseId: string;

  // Save/modal status
  isSaving: boolean;
  showLastSubModal: boolean;
  showClearConfirmModal: boolean;

  // Canvas / annotation state
  drawTool: ToolType;
  penColor: string;
  zoomScale: number;
  isAutoCropEnabled: boolean;
  currentStrokes: VectorStroke[];

  // PDF paging
  currentPage: number;
  totalPages: number;
  isScanPdf: boolean;
}

const INITIAL_STATE: GradingState = {
  currentIndex: 0,
  scoreInputs: {},
  manualOverride: {},
  activeExerciseId: '',
  isSaving: false,
  showLastSubModal: false,
  showClearConfirmModal: false,
  drawTool: 'pen',
  penColor: '#ef4444',
  zoomScale: 1.0,
  isAutoCropEnabled: true,
  currentStrokes: [],
  currentPage: 1,
  totalPages: 1,
  isScanPdf: false,
};

function createGradingStore() {
  const { subscribe, set, update } = writable<GradingState>({ ...INITIAL_STATE });

  return {
    subscribe,

    /** Reset to a fresh default state (e.g. when unmounting the grading route). */
    reset() {
      set({ ...INITIAL_STATE });
    },

    setCurrentIndex(index: number) {
      update((s) => ({ ...s, currentIndex: index }));
    },

    setScoreInputs(scoreInputs: Record<string, number | null>) {
      update((s) => ({ ...s, scoreInputs }));
    },

    setScoreInput(exerciseId: string, value: number | null) {
      update((s) => ({ ...s, scoreInputs: { ...s.scoreInputs, [exerciseId]: value } }));
    },

    setManualOverride(manualOverride: Record<string, boolean>) {
      update((s) => ({ ...s, manualOverride }));
    },

    setManualOverrideFlag(exerciseId: string, flag: boolean) {
      update((s) => ({ ...s, manualOverride: { ...s.manualOverride, [exerciseId]: flag } }));
    },

    setActiveExerciseId(exerciseId: string) {
      update((s) => ({ ...s, activeExerciseId: exerciseId }));
    },

    setSaving(isSaving: boolean) {
      update((s) => ({ ...s, isSaving }));
    },

    setShowLastSubModal(show: boolean) {
      update((s) => ({ ...s, showLastSubModal: show }));
    },

    setShowClearConfirmModal(show: boolean) {
      update((s) => ({ ...s, showClearConfirmModal: show }));
    },

    setDrawTool(tool: ToolType) {
      update((s) => ({ ...s, drawTool: tool }));
    },

    setZoomScale(zoomScale: number) {
      update((s) => ({ ...s, zoomScale }));
    },

    setAutoCropEnabled(enabled: boolean) {
      update((s) => ({ ...s, isAutoCropEnabled: enabled }));
    },

    setCurrentStrokes(strokes: VectorStroke[]) {
      update((s) => ({ ...s, currentStrokes: strokes }));
    },

    setPdfPaging(page: number, totalPages: number, isScanPdf: boolean) {
      update((s) => ({ ...s, currentPage: page, totalPages, isScanPdf }));
    },

    setCurrentPage(page: number) {
      update((s) => ({ ...s, currentPage: page }));
    },

    /** Synchronous snapshot getter, mirroring get(store) for convenience. */
    getState(): GradingState {
      return get({ subscribe });
    },
  };
}

export const gradingStore = createGradingStore();
