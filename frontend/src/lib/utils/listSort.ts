import type { ExamRecord } from "#lib/db/schema";
import type { ExerciseGroup } from "#lib/exercise-library/groupExercises";
import { safeLocalStorage } from "./storage";

export type ExamSortKey = "newest" | "oldest" | "title" | "grade" | "subject";
export type GroupSortKey = "nameAsc" | "nameDesc" | "recent" | "pointsDesc" | "pointsAsc" | "grade" | "subject";

export const EXAM_SORT_KEYS: readonly ExamSortKey[] = ["newest", "oldest", "title", "grade", "subject"];
export const GROUP_SORT_KEYS: readonly GroupSortKey[] = [
  "nameAsc", "nameDesc", "recent", "pointsDesc", "pointsAsc", "grade", "subject",
];

export const SORT_STORAGE = { exams: "bg_sort_exams", exercises: "bg_sort_exercises", picker: "bg_sort_picker" } as const;

/** Natural, case-insensitive text order ("2a" before "10a"). */
export const compareText = (a?: string | null, b?: string | null): number =>
  (a ?? "").localeCompare(b ?? "", undefined, { numeric: true, sensitivity: "base" });

/** Text order with empty values last; ties fall back to `then`. */
function byText<T>(pick: (item: T) => string | undefined | null, then: (a: T, b: T) => number) {
  return (a: T, b: T) => {
    const x = pick(a) ?? "";
    const y = pick(b) ?? "";
    if (!x !== !y) return x ? -1 : 1;
    return compareText(x, y) || then(a, b);
  };
}

export function loadSort<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const stored = safeLocalStorage.getItem(key);
  return allowed.find((a) => a === stored) ?? fallback;
}

export function saveSort(key: string, value: string): void {
  safeLocalStorage.setItem(key, value);
}

const examTitle = (e: ExamRecord) => e.title;
const examGrade = (e: ExamRecord) => e.grade || e.klasse;
const examNewest = (a: ExamRecord, b: ExamRecord) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "");

/** Sorted copy; never mutates the (raw state) input. */
export function sortExams(exams: ExamRecord[], key: string): ExamRecord[] {
  const out = [...exams];
  switch (key) {
    case "oldest":
      return out.sort((a, b) => -examNewest(a, b));
    case "title":
      return out.sort(byText(examTitle, examNewest));
    case "grade":
      return out.sort(byText(examGrade, byText(examTitle, examNewest)));
    case "subject":
      return out.sort(byText((e) => e.fach, byText(examTitle, examNewest)));
    default:
      return out.sort(examNewest);
  }
}

const lastChange = (g: ExerciseGroup) =>
  g.allMembers.reduce((max, m) => {
    const at = m.ex.updatedAt || m.ex.createdAt || "";
    return at > max ? at : max;
  }, "");

/** Sorted copy of the groups. */
export function sortGroups(groups: ExerciseGroup[], key: string): ExerciseGroup[] {
  const byName = (a: ExerciseGroup, b: ExerciseGroup) => compareText(a.name, b.name);
  const out = [...groups];
  switch (key) {
    case "nameDesc":
      return out.sort((a, b) => byName(b, a));
    case "recent":
      return out.sort((a, b) => lastChange(b).localeCompare(lastChange(a)) || byName(a, b));
    case "pointsDesc":
      return out.sort((a, b) => b.maxPoints - a.maxPoints || byName(a, b));
    case "pointsAsc":
      return out.sort((a, b) => a.maxPoints - b.maxPoints || byName(a, b));
    case "grade":
      return out.sort(byText((g) => g.grade, byName));
    case "subject":
      return out.sort(byText((g) => g.subject, byName));
    default:
      return out.sort(byName);
  }
}
