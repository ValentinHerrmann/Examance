/**
 * Data loading of the exam page: the exam with its exercises and MC groups (server first, Dexie as
 * fallback), the library and the submissions. Results follow the account's mode via the repositories.
 */
import { browser } from "$app/env";
import { api } from "#lib/api/client";
import { db } from "#lib/db/db";
import type { ExamExerciseRecord, ExamRecord, ExerciseRecord, SubmissionRecord } from "#lib/db/schema";
import {
  encryptExercise,
  loadExamEncrypted,
  loadExamExercisesEncrypted,
  loadExercisesEncrypted,
  loadLocalMcGroups,
  type McGroup,
} from "#lib/db/dbEncryption";
import { buildExamItems, mapRemoteMcGroups, type ExamItemRef } from "#lib/grading/omrTemplatePrep";
import { translate } from "#lib/i18n";
import { mapApiToExamRecord } from "#lib/repositories/examRepository";
import { mapApiToExerciseRecord } from "#lib/repositories/exerciseRepository";
import { submissionRepository } from "#lib/repositories/submissionRepository";

/** The page state `loadExamData` fills as it goes, so a load that fails midway keeps what it had already set. */
export interface ExamLoadTarget {
  exam: ExamRecord | null;
  exercises: ExerciseRecord[];
  mcGroups: McGroup[];
  examItems: ExamItemRef[];
  isLocalFallback: boolean;
  /** Set when the exam exists neither on the server nor locally. */
  errorMsg: string;
}

export interface ExamLoadContext {
  key: CryptoKey | null;
  /** Server-account session: the server copy is read first and mirrored into Dexie. */
  authenticated: boolean;
  /** True once a newer load has started; a stale run must stop writing. */
  isStale: () => boolean;
}

/** Loads the exam, its exercises and MC groups into `target`. Returns false when the run went stale. */
export async function loadExamData(id: string, ctx: ExamLoadContext, target: ExamLoadTarget): Promise<boolean> {
  const { key, authenticated, isStale } = ctx;
  if (authenticated) {
    try {
      const remoteExam = (await api.get(`/exams/${id}`)) as any;
      if (isStale()) return false;
      target.exam = mapApiToExamRecord(remoteExam);
      const remoteExercises: ExerciseRecord[] = remoteExam.exercises.map(mapApiToExerciseRecord);
      target.exercises = remoteExercises;
      // Only a response that actually carries `mc_groups` may rewrite
      // local grouping — otherwise this would replace every junction's
      // mcGroupId with undefined and dissolve the groups.
      const groupsAreAuthoritative = Array.isArray(remoteExam.mc_groups);

      if (groupsAreAuthoritative) {
        const remoteGroups = mapRemoteMcGroups(remoteExam.mc_groups);
        target.mcGroups = remoteGroups;
        const mcGroupRecords = remoteGroups.map((g, idx) => ({
          id: g.id,
          examId: id,
          title: g.title,
          scoringText: g.scoringText,
          orderIndex: g.orderIndex ?? idx + 1,
        }));
        if (isStale()) return false;
        await db.transaction("rw", db.examMcGroups, async () => {
          await db.examMcGroups.where("examId").equals(id).delete();
          if (mcGroupRecords.length > 0) {
            await db.examMcGroups.bulkPut(mcGroupRecords);
          }
        });
      } else {
        target.mcGroups = await loadLocalMcGroups(id);
        if (isStale()) return false;
      }
      if (remoteExercises.length > 0) {
        const encExs = await Promise.all(remoteExercises.map((ex: any) => encryptExercise(ex, key)));
        // When the response said nothing about groups, membership comes from
        // the rows we already hold rather than from the response's silence.
        const storedLinks = groupsAreAuthoritative
          ? new Map<string, ExamExerciseRecord>()
          : new Map(
              (await db.examExercises.where("examId").equals(id).toArray()).map(
                (link) => [link.exerciseId, link],
              ),
            );
        const junctions = remoteExercises.map((ex: any, idx: number) => {
          const stored = storedLinks.get(ex.id);
          return {
            examId: id,
            exerciseId: ex.id,
            orderIndex: ex.orderIndex || (idx + 1),
            mcGroupId: ex.mcGroupId ?? stored?.mcGroupId,
            subIndex: ex.subIndex ?? stored?.subIndex,
          };
        });
        if (isStale()) return false;
        await db.transaction("rw", [db.exercises, db.examExercises], async () => {
          await db.exercises.bulkPut(encExs);
          // Replace, don't merge: a link the server dropped must not survive
          // locally and reappear as a phantom exercise on the next open.
          await db.examExercises.where("examId").equals(id).delete();
          await db.examExercises.bulkPut(junctions);
        });
      } else {
        const localExs = await loadExamExercisesEncrypted(id, key);
        if (isStale()) return false;
        if (localExs.length > 0) {
          target.exercises = localExs;
        }
      }
      target.isLocalFallback = false;
    } catch (serverErr) {
      // Fall back to IndexedDB if exam is not on server
      const localExam = (await loadExamEncrypted(id, key)) || null;
      if (isStale()) return false;
      target.exam = localExam;
      if (localExam) {
        target.isLocalFallback = true;
        target.exercises = await loadExamExercisesEncrypted(id, key);
        target.mcGroups = await loadLocalMcGroups(id);
        if (isStale()) return false;
      } else {
        target.errorMsg = translate("exam.page.examNotFoundOrDeleted");
        console.error("Exam not found on server or locally:", serverErr);
      }
    }
  } else {
    target.isLocalFallback = false;
    const localExam = (await loadExamEncrypted(id, key)) || null;
    const localExercises = await loadExamExercisesEncrypted(id, key);
    const localGroups = await loadLocalMcGroups(id);
    if (isStale()) return false;
    target.exam = localExam;
    target.exercises = localExercises;
    target.mcGroups = localGroups;
  }
  target.examItems = buildExamItems(target.exercises, target.mcGroups);
  return true;
}

/** The account's exercise library, or null when it cannot be read (the caller keeps what it has). */
export async function loadLibraryExercises(key: CryptoKey | null): Promise<ExerciseRecord[] | null> {
  if (!browser || !key) return null;
  try {
    return await loadExercisesEncrypted(key);
  } catch {
    return null;
  }
}

/** Submissions of the exam, or null when the run went stale. A failed read is `error`, never an empty list. */
export async function loadExamSubmissions(
  id: string,
  key: CryptoKey | null,
  isStale: () => boolean,
): Promise<{ submissions: SubmissionRecord[]; error: string } | null> {
  try {
    const submissions = await submissionRepository.getByExamId(id, key);
    if (isStale()) return null;
    return { submissions, error: "" };
  } catch (err) {
    if (isStale()) return null;
    return {
      submissions: [],
      error: translate("exam.page.submissions.loadFailed", {
        message: err instanceof Error ? err.message : String(err),
      }),
    };
  }
}
