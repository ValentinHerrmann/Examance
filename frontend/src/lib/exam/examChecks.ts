import type { ExamRecord, ExerciseRecord, StudentRecord } from '#lib/db/schema';

/** One tick the teacher set by hand: when, and the fingerprint of what it was set for (issue #212). */
export interface StepCheck {
    at: string;
    stamp: string;
}

/** What can be printed: plain exam copies, the QR sticker sheet, personalised copies (QR printed on), the solution. */
export const PRINT_JOBS = ['exam', 'qr', 'copies', 'solution'] as const;
export type PrintJobId = (typeof PRINT_JOBS)[number];

/** How the teacher prints: plain copies plus a QR sticker sheet, or personalised copies; the solution only when wanted. */
export interface PrintPlan {
    mode: 'stickers' | 'copies';
    solution: boolean;
}
export const DEFAULT_PRINT_PLAN: PrintPlan = { mode: 'stickers', solution: false };

/** The print jobs a plan asks for, in print order. */
export function printJobs(plan: PrintPlan | undefined): PrintJobId[] {
    const p = plan ?? DEFAULT_PRINT_PLAN;
    return [...(p.mode === 'copies' ? (['copies'] as const) : (['exam', 'qr'] as const)), ...(p.solution ? (['solution'] as const) : [])];
}

/** How the teacher checks the sure MC detections: every one, a share of random samples, or not at all. */
export type McSureMode = 'all' | 'sample' | 'none';
export const MC_SAMPLE_PERCENTS = [5, 10, 20, 30] as const;
export const MC_SAMPLE_DEFAULT = 10;

export interface McChecks {
    /** Unset = not chosen yet, counted like `all`. */
    mode?: McSureMode;
    samplePercent?: number;
    /** The last "mark all sure as reviewed": its `reviewedAt` stamp, so an undo touches exactly those rows. */
    bulk?: { at: string; count: number };
}

/** The ticks and choices of the Print and MC steps; only the teacher sets them, a compile or a page visit never does. */
export interface StepChecks {
    /** "Printed" ticks per job. */
    print?: Partial<Record<PrintJobId, StepCheck>>;
    printPlan?: PrintPlan;
    /** The stamp each QR job's PDF was last made for in Examance; its tick is only offered while that matches. */
    printMade?: Partial<Record<PrintJobId, string>>;
    mc?: McChecks;
}

/** Fast non-cryptographic fingerprint (cyrb53); it only has to notice a change. */
export function fingerprint(text: string): string {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < text.length; i++) {
        const ch = text.codePointAt(i) ?? 0;
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
        // Only when set, so stamps of exams without an override (all older ones) stay as they were.
        ...(e.course ? [e.course] : []),
    ];
    const body = exercises.map((x) => [x.id, x.version, x.orderIndex, x.mcGroupId, x.subIndex, x.maxPoints, x.latexBody]);
    return fingerprint(JSON.stringify([head, body]));
}

/** Locale-independent order, so the same list always gives the same stamp. */
const byCodeUnits = (a: string, b: string): number => Number(a > b) - Number(a < b);

/** What the QR stickers, copies and key slips depend on: the exam's students and their names. */
export function studentsStamp(students: StudentRecord[]): string {
    const rows = students.map((s) => JSON.stringify([s.pseudonymHmac, s.studentName ?? '', s.studentNumber ?? '']));
    rows.sort(byCodeUnits);
    return fingerprint(rows.join('\n'));
}

export type PrintStamps = Record<PrintJobId, string>;

/** The exam and solution follow the content, the sticker sheet the student list, personalised copies both. */
export function printStamps(content: string, students: string): PrintStamps {
    return { exam: content, solution: content, qr: students, copies: fingerprint(`${content}:${students}`) };
}

/** A tick counts only while the content it was set for is unchanged. */
export function printCheckValid(checks: StepChecks | null | undefined, id: PrintJobId, stamps: PrintStamps): boolean {
    const c = checks?.print?.[id];
    return !!c && c.stamp === stamps[id];
}

/** Ticked once, then the content changed: shown as "changed since", counted as open. */
export function printCheckChanged(checks: StepChecks | null | undefined, id: PrintJobId, stamps: PrintStamps): boolean {
    const c = checks?.print?.[id];
    return !!c && c.stamp !== stamps[id];
}

/** The job's PDF was made in Examance for the current content. */
export function printMadeValid(checks: StepChecks | null | undefined, id: PrintJobId, stamps: PrintStamps): boolean {
    return checks?.printMade?.[id] === stamps[id];
}

/** Sidebar status of the Print step: valid ticks over the jobs of the plan. */
export function printStatus(checks: StepChecks | null | undefined, stamps: PrintStamps): { count: number; total: number; done: boolean } {
    const jobs = printJobs(checks?.printPlan);
    const count = jobs.filter((id) => printCheckValid(checks, id, stamps)).length;
    return { count, total: jobs.length, done: count === jobs.length };
}

/** The checks with one print tick set or cleared. */
export function withPrintCheck(checks: StepChecks | null | undefined, id: PrintJobId, stamp: string | null): StepChecks {
    const print = { ...checks?.print };
    if (stamp === null) delete print[id];
    else print[id] = { at: new Date().toISOString(), stamp };
    return { ...checks, print };
}

/** The checks with a job's PDF recorded as made for `stamp`. */
export function withPrintMade(checks: StepChecks | null | undefined, id: PrintJobId, stamp: string): StepChecks {
    return { ...checks, printMade: { ...checks?.printMade, [id]: stamp } };
}

export function withPrintPlan(checks: StepChecks | null | undefined, plan: PrintPlan): StepChecks {
    return { ...checks, printPlan: plan };
}

/** How many sure detections the chosen mode wants looked at. */
export function mcSureTarget(sureTotal: number, mc: McChecks | undefined): number {
    if (mc?.mode === 'none') return 0;
    if (mc?.mode === 'sample') return Math.min(sureTotal, Math.ceil((sureTotal * (mc.samplePercent ?? MC_SAMPLE_DEFAULT)) / 100));
    return sureTotal;
}

/** Sidebar status of the MC step: open uncertain/failed items first, then the sure ones looked at against the mode's target. */
export function mcStatus(
    summary: { open: number; sureTotal: number; sureReviewed: number },
    checks: StepChecks | null | undefined,
): { count: number; total?: number; done: boolean } {
    if (summary.open > 0) return { count: summary.open, done: false };
    const target = mcSureTarget(summary.sureTotal, checks?.mc);
    if (summary.sureReviewed >= target) return { count: 0, done: true };
    return { count: summary.sureReviewed, total: target, done: false };
}

/** The checks with the MC part changed (mode, sample share or bulk marker). */
export function withMcChecks(checks: StepChecks | null | undefined, patch: Partial<McChecks>): StepChecks {
    const mc: McChecks = { ...checks?.mc, ...patch };
    for (const k of Object.keys(mc) as (keyof McChecks)[]) if (mc[k] === undefined) delete mc[k];
    return { ...checks, mc };
}

function mcField(raw: Record<string, unknown> | undefined): McChecks {
    const mc: McChecks = {};
    if (raw?.mode === 'all' || raw?.mode === 'sample' || raw?.mode === 'none') mc.mode = raw.mode;
    if (typeof raw?.samplePercent === 'number' && raw.samplePercent > 0 && raw.samplePercent <= 100) mc.samplePercent = raw.samplePercent;
    const bulk = raw?.bulk as { at?: unknown; count?: unknown } | undefined;
    if (bulk && typeof bulk.at === 'string' && typeof bulk.count === 'number') mc.bulk = { at: bulk.at, count: bulk.count };
    return mc;
}

function checkField(value: unknown): StepCheck | undefined {
    const v = value as Partial<StepCheck> | null;
    return v && typeof v.at === 'string' && typeof v.stamp === 'string' ? { at: v.at, stamp: v.stamp } : undefined;
}

/** Accepts the stored JSON of any shape; undefined stays undefined (unknown), junk becomes empty checks. */
export function stepChecksField(value: unknown): StepChecks | undefined {
    if (value === undefined) return undefined;
    const raw = (value && typeof value === 'object' ? value : {}) as {
        print?: Record<string, unknown>;
        printPlan?: Partial<PrintPlan>;
        printMade?: Record<string, unknown>;
        mc?: Record<string, unknown>;
    };
    const print: StepChecks['print'] = {};
    const printMade: StepChecks['printMade'] = {};
    for (const id of PRINT_JOBS) {
        const c = checkField(raw.print?.[id]);
        if (c) print[id] = c;
        const made = raw.printMade?.[id];
        if (typeof made === 'string') printMade[id] = made;
    }
    const plan = raw.printPlan;
    const printPlan: PrintPlan | undefined =
        plan && (plan.mode === 'stickers' || plan.mode === 'copies') ? { mode: plan.mode, solution: plan.solution === true } : undefined;
    return { print, ...(printPlan ? { printPlan } : {}), printMade, mc: mcField(raw.mc) };
}
