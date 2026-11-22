/** Asks before a mark lands outside the active exercise (issue #234): decides, per new mark, whether to ask and what to offer. State lives per student; the viewer resets it on every submission load. */

import { regionAccepts, regionAt, regionTargets, type RegionMap } from "./exerciseRegions";
import type { GradingTarget } from "./gradingTargets";

/** After "stay on the current exercise", no question for this long. */
export const GUARD_COOL_OFF_MS = 10_000;

/** What to ask: `switch` = the mark is in another exercise's area (`candidates` are its targets); `pick` = no exercise owns the area. */
export type GuardQuestion =
  | { kind: "switch"; candidates: GradingTarget[]; current: GradingTarget | undefined }
  | { kind: "pick"; candidates: GradingTarget[]; current: GradingTarget | undefined; page: number };

/** The answer: the target the mark goes to (the current one = stay), or null = drop the mark. */
export type GuardAnswer = GradingTarget | null;

const keyOf = (t: { exercise: { id: string }; partLabel: string }) => `${t.exercise.id}#${t.partLabel}`;

export class ExerciseGuard {
  private map: RegionMap | null = null;
  private quietUntil = 0;
  /** Target chosen per page that no exercise owns, for this student. */
  private readonly pageChoice = new Map<number, string>();

  /** The regions of the current layout; null switches the check off. */
  setMap(map: RegionMap | null) {
    this.map = map && map.regions.length > 0 ? map : null;
  }

  get active(): boolean {
    return this.map !== null;
  }

  /** A new student: no cool-off, no page choices. */
  reset() {
    this.quietUntil = 0;
    this.pageChoice.clear();
  }

  /** The question for a mark at reading-order offset `at` on `page`, or null when the mark goes to the active target as is. */
  question(page: number, at: number, active: GradingTarget | undefined, targets: GradingTarget[], now: number): GuardQuestion | null {
    const map = this.map;
    if (!map || !active) return null;
    const region = regionAt(map, at);
    if (region && regionAccepts(region, active.exercise.id, active.partLabel)) return null;
    if (!region) return this.pageChoice.get(page) === keyOf(active) ? null : { kind: "pick", candidates: targets, current: active, page };
    if (now < this.quietUntil) return null;
    const candidates = regionTargets(region, targets);
    return candidates.length > 0 ? { kind: "switch", candidates, current: active } : null;
  }

  /** Records the answer, so the same mark is not asked about again. */
  answered(question: GuardQuestion, answer: GuardAnswer, now: number) {
    if (!answer) return;
    if (question.kind === "pick") this.pageChoice.set(question.page, keyOf(answer));
    else if (question.current && keyOf(answer) === keyOf(question.current)) this.quietUntil = now + GUARD_COOL_OFF_MS;
  }
}
