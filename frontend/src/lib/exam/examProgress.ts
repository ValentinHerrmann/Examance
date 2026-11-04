import { EXAM_STEPS, type ExamStep } from '#lib/components/layout/examNavItems';

/** One step's badge; an absent field is unknown (a failed or skipped read) and shows nothing, never a 0. */
export interface StepStatus {
    count?: number;
    total?: number;
    done?: boolean;
    /** Something needs attention, e.g. result mails that did not arrive. */
    alert?: number;
}

export type ExamProgress = Partial<Record<ExamStep, StepStatus>>;

export interface ExamProgressInput {
    exerciseCount?: number;
    studentCount?: number;
    submissionCount?: number;
    gradedCount?: number;
    /** The hand-set print checklist (`printStatus`); compiling never sets it. */
    print?: StepStatus;
    mcOpen?: number;
    sharedCount?: number;
    notReached?: number;
}

/** Cheap per-step statuses from counts the caller already has (issue #212). */
export function examProgress(input: ExamProgressInput): ExamProgress {
    const p: ExamProgress = {};
    if (input.exerciseCount !== undefined) p.content = { count: input.exerciseCount, done: input.exerciseCount > 0 };
    if (input.studentCount !== undefined) p.students = { count: input.studentCount, done: input.studentCount > 0 };
    if (input.print !== undefined) p.print = input.print;
    if (input.submissionCount !== undefined) p.scan = { count: input.submissionCount, done: input.submissionCount > 0 };
    if (input.mcOpen !== undefined) p.verify = { count: input.mcOpen, done: input.mcOpen === 0 };
    if (input.gradedCount !== undefined && input.submissionCount !== undefined) {
        p.grade = {
            count: input.gradedCount,
            total: input.submissionCount,
            done: input.submissionCount > 0 && input.gradedCount >= input.submissionCount,
        };
    }
    if (input.sharedCount !== undefined || input.notReached !== undefined) {
        p.results = {
            ...(input.sharedCount !== undefined ? { count: input.sharedCount, done: input.sharedCount > 0 } : {}),
            ...(input.notReached ? { alert: input.notReached } : {}),
        };
    }
    return p;
}

/** The step after this one in the flow, or null after the last. */
export function nextStep(step: ExamStep): ExamStep | null {
    const i = EXAM_STEPS.findIndex((s) => s.step === step);
    return i >= 0 && i + 1 < EXAM_STEPS.length ? EXAM_STEPS[i + 1].step : null;
}

const CONTINUE_ORDER: ExamStep[] = ['content', 'students', 'print', 'scan', 'grade', 'results'];

/** The first step of the main path that is known and not done; unknown steps (a failed or skipped read) are skipped. Results when everything is done. */
export function continueStep(progress: ExamProgress): ExamStep {
    for (const step of CONTINUE_ORDER) {
        if (step === 'results') return step;
        const status = progress[step];
        if (status && !status.done) return step;
    }
    return 'results';
}
