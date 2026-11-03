import type { ExamProgress } from '#lib/exam/examProgress';
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

export const examNavContext = writable<ExamNavContext | null>(null);

/** Open MC checks, known only once the verify page computed its queues: published here for the step badge. */
export const examMcOpen = writable<{ examId: string; open: number } | null>(null);
