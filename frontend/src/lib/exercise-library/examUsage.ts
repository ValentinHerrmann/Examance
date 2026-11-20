import { get } from "svelte/store";
import { api } from "#lib/api/client";
import { db } from "#lib/db/db";
import { examRepository } from "#lib/repositories/examRepository";
import { sessionStore } from "#lib/stores/session";
import { isServerBacked } from "#lib/utils/serverBacked";

/** Key of one variant inside the library list's usage map. */
export function usageKey(groupId: string, variantKey: string): string {
  return `${groupId}\u001f${variantKey}`;
}

export interface ExamUsageEntry {
  id: string;
  title: string;
  datum?: string;
}

/** Exams linking any of the given exercise rows (all versions of one variant). Throws when the server cannot answer: the local mirror is incomplete in server mode, and an empty answer would let a used exercise be deleted (issue #298). */
export async function loadExamUsage(exerciseIds: string[]): Promise<ExamUsageEntry[]> {
  const found = new Map<string, ExamUsageEntry>();

  if (isServerBacked()) {
    const usages = await Promise.all(
      exerciseIds.map((id) => api.get<any>(`/exercises/${id}/usage`, { silentError: true }))
    );
    for (const u of usages) {
      for (const e of u.exams ?? []) {
        found.set(e.id, { id: e.id, title: e.title, datum: e.datum ?? undefined });
      }
    }
    return [...found.values()];
  }

  const links = await db.examExercises.where("exerciseId").anyOf(exerciseIds).toArray();
  const key = get(sessionStore).sessionKey;
  // Pure reads in parallel; `map` keeps the exam order.
  const examIds = [...new Set(links.map((l) => l.examId))];
  // A display list: an exam that cannot be read is left out rather than failing the dialog.
  const exams = await Promise.all(examIds.map((examId) => examRepository.getById(examId, key).catch(() => undefined)));
  examIds.forEach((examId, i) => {
    const exam = exams[i];
    if (exam) found.set(examId, { id: examId, title: exam.title ?? "", datum: exam.datum });
  });
  return [...found.values()];
}
