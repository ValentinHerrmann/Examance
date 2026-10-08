/**
 * gradingStore: a deliberate, scoped exception to the "plain props" convention. The grading route has too much cross-cutting
 * state (submission, scores, strokes, zoom/pan, PDF paging) to pass to 15+ leaves, which subscribe via `$gradingStore`.
 * Async loading/saving stays owned by the route; the store has none.
 */

import { writable, get } from 'svelte/store';
import type { OmrScoreMeta } from '#lib/db/schema';

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

/** Detected/edited MC/SC/TF answer state for one exercise, keyed by exerciseId. */
export interface McAnswerState {
  selectedOptions: number[];
  omrMeta?: OmrScoreMeta;
}

export interface GradingState {
  // Navigation / identity
  currentIndex: number;

  // Scoring
  scoreInputs: Record<string, number | null>;
  manualOverride: Record<string, boolean>;
  activeExerciseId: string;

  /** MC/SC/TF answer review state — omitted for exercises with no stored score yet. */
  mcState: Record<string, McAnswerState>;

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

    /** True once the teacher changed the current submission (stroke, score, MC toggle) since load/save; loading and re-deriving auto scores never set it. */
  isDirty: boolean;

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
  mcState: {},
  isSaving: false,
  showLastSubModal: false,
  showClearConfirmModal: false,
  drawTool: 'pen',
  penColor: '#ef4444',
  zoomScale: 1.0,
  isAutoCropEnabled: true,
  currentStrokes: [],
  isDirty: false,
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
      update((s) => ({ ...s, scoreInputs: { ...s.scoreInputs, [exerciseId]: value }, isDirty: true }));
    },

    setManualOverride(manualOverride: Record<string, boolean>) {
      update((s) => ({ ...s, manualOverride }));
    },

    setManualOverrideFlag(exerciseId: string, flag: boolean) {
      update((s) => ({ ...s, manualOverride: { ...s.manualOverride, [exerciseId]: flag }, isDirty: true }));
    },

    setActiveExerciseId(exerciseId: string) {
      update((s) => ({ ...s, activeExerciseId: exerciseId }));
    },

    setMcState(mcState: Record<string, McAnswerState>) {
      update((s) => ({ ...s, mcState }));
    },

    setMcStateForExercise(exerciseId: string, state: McAnswerState) {
      update((s) => ({ ...s, mcState: { ...s.mcState, [exerciseId]: state }, isDirty: true }));
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

    /** A user edit on the canvas (draw, stamp, erase, clear). */
    markDirty() {
      update((s) => ({ ...s, isDirty: true }));
    },

    /** Called after loading a submission and after a successful save. */
    markClean() {
      update((s) => ({ ...s, isDirty: false }));
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
