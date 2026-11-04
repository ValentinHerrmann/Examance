import type { ExamProgress } from '#lib/exam/examProgress';
import type { StepChecks } from '#lib/exam/examChecks';
import { writable } from 'svelte/store';
import { safeLocalStorage } from '#lib/utils/storage';
import type { ExamRecord } from '#lib/db/schema';

/** App-shell state shared by navbar, navigation drawer and exam sidebar. Presentational only; nothing here touches the vault. */

/** Phone / iPad-portrait navigation drawer (opened by the navbar burger). */
export const mobileNavOpen = writable(false);

/** Exam sidebar preference. `null` = automatic (64px rail at `lg` and on the grade page, open from `xl`); an explicit toggle is remembered across sessions. */
export type SidebarPreference = 'open' | 'collapsed' | null;

const SIDEBAR_KEY = 'bg_sidebar_collapsed';

function readSidebarPreference(): SidebarPreference {
    const saved = safeLocalStorage.getItem(SIDEBAR_KEY);
    if (saved === 'true') return 'collapsed';
    if (saved === 'false') return 'open';
    return null;
}

export const sidebarPreference = writable<SidebarPreference>(readSidebarPreference());

export function setSidebarCollapsed(collapsed: boolean): void {
    safeLocalStorage.setItem(SIDEBAR_KEY, collapsed ? 'true' : 'false');
    sidebarPreference.set(collapsed ? 'collapsed' : 'open');
}

/** The exam the current route belongs to, published by routes/exam/[id]/+layout so the drawer can list its steps on phones. */
export interface ExamNavContext {
    examId: string;
    exam: ExamRecord | null;
    submissionCount: number;
    /** Step badges (issue #212); a step without an entry shows none. */
    progress: ExamProgress;
}

/** The open exam's hand-set ticks and the fingerprints they are checked against (issue #212); the layout loads them, the Print and MC pages change them. */
export interface ExamChecksState {
    examId: string;
    checks: StepChecks;
    /** Fingerprints of the exam content and of its students; null while a read failed. */
    stamps: { content: string; students: string } | null;
    /** Fingerprint of the exam's scans (the sure MC detections depend on them); null while unknown. */
    scansStamp: string | null;
}

export const examChecksState = writable<ExamChecksState | null>(null);

export const examNavContext = writable<ExamNavContext | null>(null);

/** Open MC checks, known only once the verify page computed its queues: published here for the step badge. */
export const examMcOpen = writable<{ examId: string; open: number } | null>(null);
