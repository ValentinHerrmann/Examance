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
    /** Position in the flow; null for the overview, which is no step of its own. */
    number: number | null;
    href: string;
    labelKey: TranslationKey;
    /** A longer explanation shown on hover, for a step whose short name needs it. */
    hintKey?: TranslationKey;
    icon: IconDefinition;
    active: boolean;
}

export const EXAM_STEPS: { step: ExamStep; suffix: string; labelKey: TranslationKey; hintKey?: TranslationKey; icon: IconDefinition }[] = [
    { step: 'overview', suffix: '', labelKey: 'exam.sidebar.overview', icon: faHouse },
    { step: 'content', suffix: '/content', labelKey: 'exam.sidebar.content', icon: faLayerGroup },
    { step: 'students', suffix: '/students', labelKey: 'exam.sidebar.students', icon: faUsers },
    { step: 'print', suffix: '/print', labelKey: 'exam.sidebar.print', icon: faPrint },
    { step: 'scan', suffix: '/scan', labelKey: 'exam.sidebar.scan', icon: faFileLines },
    { step: 'verify', suffix: '/verify', labelKey: 'exam.sidebar.verify', icon: faListCheck },
    { step: 'grade', suffix: '/grade', labelKey: 'exam.sidebar.grade', icon: faPenToSquare },
    { step: 'manual', suffix: '/manual', labelKey: 'exam.sidebar.manual', hintKey: 'exam.sidebar.manualHint', icon: faTableCells },
    { step: 'results', suffix: '/results', labelKey: 'exam.sidebar.results', icon: faChartColumn },
];

export function examStepHref(examId: string, step: ExamStep): string {
    const entry = EXAM_STEPS.find((s) => s.step === step);
    return `/exam/${encodeURIComponent(examId)}${entry?.suffix ?? ''}`;
}

export function examNavItems(examId: string, pathname: string): ExamNavItem[] {
    const base = `/exam/${encodeURIComponent(examId)}`;
    return EXAM_STEPS.map(({ step, suffix, labelKey, hintKey, icon }, index) => {
        const href = base + suffix;
        const active =
            step === 'overview' ? pathname === base || pathname === `${base}/` : pathname.startsWith(href);
        return { step, number: index === 0 ? null : index, href, labelKey, hintKey, icon, active };
    });
}
