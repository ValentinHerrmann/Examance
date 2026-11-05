import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import {
    faChartColumn,
    faFileLines,
    faHouse,
    faListCheck,
    faPenToSquare,
    faPrint,
    faTableCells,
    faUsers,
    faLayerGroup,
} from '@fortawesome/free-solid-svg-icons';
import type { TranslationKey } from '#lib/i18n';

/** Exam steps in flow order: the one list behind the sidebar, the phone drawer, the "Next" button and the exam-list cards (issue #212). */
export type ExamStep = 'overview' | 'content' | 'students' | 'print' | 'scan' | 'verify' | 'grade' | 'manual' | 'results';

export interface ExamNavItem {
    step: ExamStep;
    /** Position in the flow ("1", "4A", "B"); null for the overview, which is no step of its own. */
    number: string | null;
    /** A: the scan branch (scans, MC check, digital grading); B: paper grading instead of it. */
    branch?: StepBranch;
    href: string;
    labelKey: TranslationKey;
    /** A longer explanation shown on hover, for a step whose short name needs it. */
    hintKey?: TranslationKey;
    icon: IconDefinition;
    active: boolean;
}

/** The two alternative ways from Print to Results: A grades scans, B types in points of papers graded on paper. */
export type StepBranch = 'A' | 'B';

export const EXAM_STEPS: { step: ExamStep; suffix: string; labelKey: TranslationKey; hintKey?: TranslationKey; icon: IconDefinition; branch?: StepBranch }[] = [
    { step: 'overview', suffix: '', labelKey: 'exam.sidebar.overview', icon: faHouse },
    { step: 'content', suffix: '/content', labelKey: 'exam.sidebar.content', icon: faLayerGroup },
    { step: 'students', suffix: '/students', labelKey: 'exam.sidebar.students', icon: faUsers },
    { step: 'print', suffix: '/print', labelKey: 'exam.sidebar.print', icon: faPrint },
    { step: 'scan', suffix: '/scan', labelKey: 'exam.sidebar.scan', icon: faFileLines, branch: 'A' },
    { step: 'verify', suffix: '/verify', labelKey: 'exam.sidebar.verify', icon: faListCheck, branch: 'A' },
    { step: 'grade', suffix: '/grade', labelKey: 'exam.sidebar.grade', icon: faPenToSquare, branch: 'A' },
    { step: 'manual', suffix: '/manual', labelKey: 'exam.sidebar.manual', hintKey: 'exam.sidebar.manualHint', icon: faTableCells, branch: 'B' },
    { step: 'results', suffix: '/results', labelKey: 'exam.sidebar.results', icon: faChartColumn },
];

/** The step's number as shown ("1"…"3", "4A"…"6A", "B", "7"); null for the overview. Branch B replaces the whole of A, so it has a letter only and the steps after it count on from A. */
export function stepNumber(step: ExamStep): string | null {
    const index = EXAM_STEPS.findIndex((s) => s.step === step);
    const entry = EXAM_STEPS[index];
    if (!entry || step === 'overview') return null;
    if (entry.branch === 'B') return 'B';
    const n = EXAM_STEPS.slice(1, index + 1).filter((s) => s.branch !== 'B').length;
    return entry.branch ? `${n}${entry.branch}` : String(n);
}

export function examStepHref(examId: string, step: ExamStep): string {
    const entry = EXAM_STEPS.find((s) => s.step === step);
    return `/exam/${encodeURIComponent(examId)}${entry?.suffix ?? ''}`;
}

export function examNavItems(examId: string, pathname: string): ExamNavItem[] {
    const base = `/exam/${encodeURIComponent(examId)}`;
    return EXAM_STEPS.map(({ step, suffix, labelKey, hintKey, icon, branch }) => {
        const href = base + suffix;
        const active =
            step === 'overview' ? pathname === base || pathname === `${base}/` : pathname.startsWith(href);
        return { step, number: stepNumber(step), branch, href, labelKey, hintKey, icon, active };
    });
}
