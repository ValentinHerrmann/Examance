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

/** Exams linking any of the given exercise rows (all versions of one variant). */
export async function loadExamUsage(exerciseIds: string[]): Promise<ExamUsageEntry[]> {
  const found = new Map<string, ExamUsageEntry>();

  if (isServerBacked()) {
    try {
      const usages = await Promise.all(
        exerciseIds.map((id) => api.get<any>(`/exercises/${id}/usage`, { silentError: true }))
      );
      for (const u of usages) {
        for (const e of u.exams ?? []) {
          found.set(e.id, { id: e.id, title: e.title, datum: e.datum ?? undefined });
        }
      }
      return [...found.values()];
    } catch {
      // Fall through to the local mirror.
    }
  }

  const links = await db.examExercises.where("exerciseId").anyOf(exerciseIds).toArray();
  const key = get(sessionStore).sessionKey;
  for (const examId of new Set(links.map((l) => l.examId))) {
    const exam = await examRepository.getById(examId, key);
    if (exam) found.set(examId, { id: examId, title: exam.title ?? "", datum: exam.datum });
  }
  return [...found.values()];
}
