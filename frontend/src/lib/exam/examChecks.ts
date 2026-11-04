import type { ExamRecord, ExerciseRecord, StudentRecord } from '#lib/db/schema';

/** One tick the teacher set by hand: when, and the fingerprint of what it was set for (issue #212). */
export interface StepCheck {
    at: string;
    stamp: string;
}

export const PRINT_CHECKS = ['exam', 'solution', 'qr', 'keys'] as const;
export type PrintCheckId = (typeof PRINT_CHECKS)[number];
/** Printing the exam and the QR codes is required; the solution and the key slips only count once ticked. */
export const PRINT_REQUIRED: readonly PrintCheckId[] = ['exam', 'qr'];

/** The ticks of the Print and MC steps; only the teacher sets them, a compile or a page visit never does. */
export interface StepChecks {
    print?: Partial<Record<PrintCheckId, StepCheck>>;
    mc?: { sure?: StepCheck };
}

/** Fast non-cryptographic fingerprint (cyrb53); it only has to notice a change. */
export function fingerprint(text: string): string {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const ch = text.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** What the printed exam and solution depend on: the exam's content and layout fields and its exercises in order. */
export function contentStamp(exam: ExamRecord, exercises: ExerciseRecord[]): string {
    const e = exam;
    const head = [
        e.title, e.testart, e.grade, e.klasse, e.datum, e.nr, e.fach, e.lehrernachname, e.infoText,
        e.latexPreamble, e.latexTemplate, e.numVersions, e.latexPackages, e.pageBreaks, e.nameLine,
        e.mcCorrectionHint, e.extraNotes,
    ];
    const body = exercises.map((x) => [x.id, x.version, x.orderIndex, x.mcGroupId, x.subIndex, x.maxPoints, x.latexBody]);
    return fingerprint(JSON.stringify([head, body]));
}

/** What the QR stickers, copies and key slips depend on: the exam's students and their names. */
export function studentsStamp(students: StudentRecord[]): string {
    const rows = students.map((s) => [s.pseudonymHmac, s.studentName ?? '', s.studentNumber ?? '']).sort();
    return fingerprint(JSON.stringify(rows));
}

export type PrintStamps = Record<PrintCheckId, string>;

export function printStamps(content: string, students: string): PrintStamps {
    return { exam: content, solution: content, qr: students, keys: students };
}

/** A tick counts only while the content it was set for is unchanged. */
export function printCheckValid(checks: StepChecks | null | undefined, id: PrintCheckId, stamps: PrintStamps): boolean {
    const c = checks?.print?.[id];
    return !!c && c.stamp === stamps[id];
}

/** Ticked once, then the content changed: shown as "changed since", counted as open. */
export function printCheckChanged(checks: StepChecks | null | undefined, id: PrintCheckId, stamps: PrintStamps): boolean {
    const c = checks?.print?.[id];
    return !!c && c.stamp !== stamps[id];
}

/** Sidebar status of the Print step: valid ticks over the required boxes plus any optional ones ticked. */
export function printStatus(checks: StepChecks | null | undefined, stamps: PrintStamps): { count: number; total: number; done: boolean } {
    const valid = PRINT_CHECKS.filter((id) => printCheckValid(checks, id, stamps));
    const optional = valid.filter((id) => !PRINT_REQUIRED.includes(id)).length;
    const required = PRINT_REQUIRED.filter((id) => valid.includes(id)).length;
    return {
        count: required + optional,
        total: PRINT_REQUIRED.length + optional,
        done: required === PRINT_REQUIRED.length,
    };
}

/** The checks with one print box set or cleared. */
export function withPrintCheck(checks: StepChecks | null | undefined, id: PrintCheckId, stamp: string | null): StepChecks {
    const print = { ...checks?.print };
    if (stamp === null) delete print[id];
    else print[id] = { at: new Date().toISOString(), stamp };
    return { ...checks, print };
}

/** Sidebar status of the MC step: open uncertain/failed items first, then the sure ones looked at; done needs both, or the manual "sure detections checked" tick. */
export function mcStatus(
    summary: { open: number; sureTotal: number; sureReviewed: number; sureStamp: string },
    checks: StepChecks | null | undefined,
): { count: number; total?: number; done: boolean } {
    if (summary.open > 0) return { count: summary.open, done: false };
    const manual = checks?.mc?.sure?.stamp === summary.sureStamp;
    if (manual || summary.sureReviewed >= summary.sureTotal) return { count: 0, done: true };
    return { count: summary.sureReviewed, total: summary.sureTotal, done: false };
}

/** The checks with the manual "sure detections checked" tick set or cleared. */
export function withMcSureCheck(checks: StepChecks | null | undefined, stamp: string | null): StepChecks {
    return { ...checks, mc: stamp === null ? {} : { sure: { at: new Date().toISOString(), stamp } } };
}

function checkField(value: unknown): StepCheck | undefined {
    const v = value as Partial<StepCheck> | null;
    return v && typeof v.at === 'string' && typeof v.stamp === 'string' ? { at: v.at, stamp: v.stamp } : undefined;
}

/** Accepts the stored JSON of any shape; undefined stays undefined (unknown), junk becomes empty checks. */
export function stepChecksField(value: unknown): StepChecks | undefined {
    if (value === undefined) return undefined;
    const raw = (value && typeof value === 'object' ? value : {}) as { print?: Record<string, unknown>; mc?: { sure?: unknown } };
    const print: StepChecks['print'] = {};
    for (const id of PRINT_CHECKS) {
        const c = checkField(raw.print?.[id]);
        if (c) print[id] = c;
    }
    const sure = checkField(raw.mc?.sure);
    return { print, mc: sure ? { sure } : {} };
}
