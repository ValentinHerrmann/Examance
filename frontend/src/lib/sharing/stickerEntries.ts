import type { ExerciseRecord, StudentRecord } from '#lib/db/schema';
import type { StickerEntry } from '#lib/qr/stickerSheet';
import { studentRepository } from '#lib/repositories/studentRepository';
import { numberStudents, positionLabel } from '#lib/students/classList';
import { formatStudentName, parseStudentQr, stickerRawOf } from '#lib/utils/studentQr';
import { translate } from '#lib/i18n';

/** The printable students in class-list order with their numbers (issue #266): those with a sticker payload (listed on the Students page); hand-added rows without one are left out. */
export function stickerEntries(students: readonly StudentRecord[]): StickerEntry[] {
    const numbered = numberStudents(students);
    const highest = Math.max(0, ...numbered.map((n) => n.position));
    return numbered.flatMap(({ student: st, position }) => {
        const raw = stickerRawOf(st);
        return raw ? [{ label: formatStudentName(st.studentName) || raw, number: positionLabel(position, highest), payload: raw }] : [];
    });
}

/** Reads the exam's students for printing; a failed read rejects (never "no students", issue #212). */
export async function loadStickerEntries(examId: string, key: CryptoKey | null): Promise<StickerEntry[]> {
    return stickerEntries(await studentRepository.getByExamId(examId, key));
}

/** Why the QR codes cannot be printed onto exam copies, or null: a results-only exam (exercise texts withheld) cannot be compiled. */
export function copiesUnavailable(exercises: readonly Pick<ExerciseRecord, 'codeWithheld'>[]): string | null {
    return exercises.some((ex) => ex.codeWithheld) ? translate('sharing.stickers.copiesResultsOnly') : null;
}

/** Students whose personalised page codes cannot name them (issue #220): no sticker ID, or an ID another student shares (the scan could not tell them apart). Labels, in list order. */
export function stickerIdIssues(entries: readonly StickerEntry[]): { missing: string[]; duplicates: string[] } {
    const byId = new Map<string, string[]>();
    const missing: string[] = [];
    for (const entry of entries) {
        const id = parseStudentQr(entry.payload)?.studentNumber?.trim();
        if (!id) missing.push(entry.label);
        else byId.set(id, [...(byId.get(id) ?? []), entry.label]);
    }
    return { missing, duplicates: [...byId.values()].filter((labels) => labels.length > 1).flat() };
}
