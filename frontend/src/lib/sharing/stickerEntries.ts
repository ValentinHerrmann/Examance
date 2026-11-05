import type { ExerciseRecord, StudentRecord } from '#lib/db/schema';
import type { StickerEntry } from '#lib/qr/stickerSheet';
import { studentRepository } from '#lib/repositories/studentRepository';
import { formatStudentName, stickerRawOf } from '#lib/utils/studentQr';
import { translate } from '#lib/i18n';

/** The printable students: those with a sticker payload (listed on the Students page); hand-added rows without one are left out. */
export function stickerEntries(students: readonly StudentRecord[]): StickerEntry[] {
    return students.flatMap((st) => {
        const raw = stickerRawOf(st);
        return raw ? [{ label: formatStudentName(st.studentName) || raw, payload: raw }] : [];
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
