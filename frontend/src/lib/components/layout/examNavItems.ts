import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import {
    faChartColumn,
    faFileLines,
    faListCheck,
    faPenToSquare,
    faSliders,
    faTableCells,
} from '@fortawesome/free-solid-svg-icons';
import type { TranslationKey } from '$lib/i18n';

/** Exam steps shared by the desktop sidebar and the phone drawer. */
export type ExamStep = 'setup' | 'scan' | 'verify' | 'grade' | 'manual' | 'stats';

export interface ExamNavItem {
    step: ExamStep;
    href: string;
    labelKey: TranslationKey;
    icon: IconDefinition;
    active: boolean;
}

const STEPS: { step: ExamStep; suffix: string; labelKey: TranslationKey; icon: IconDefinition }[] = [
    { step: 'setup', suffix: '', labelKey: 'exam.sidebar.setup', icon: faSliders },
    { step: 'scan', suffix: '/scan', labelKey: 'exam.sidebar.scan', icon: faFileLines },
    { step: 'verify', suffix: '/verify', labelKey: 'exam.sidebar.verify', icon: faListCheck },
    { step: 'grade', suffix: '/grade', labelKey: 'exam.sidebar.grade', icon: faPenToSquare },
    { step: 'manual', suffix: '/manual', labelKey: 'exam.sidebar.manual', icon: faTableCells },
    { step: 'stats', suffix: '/stats', labelKey: 'exam.sidebar.stats', icon: faChartColumn },
];

export function examNavItems(examId: string, pathname: string): ExamNavItem[] {
    const base = `/exam/${examId}`;
    return STEPS.map(({ step, suffix, labelKey, icon }) => {
        const href = base + suffix;
        const active =
            step === 'setup' ? pathname === base || pathname === `${base}/` : pathname.startsWith(href);
        return { step, href, labelKey, icon, active };
    });
}
