/** Change signal for exam statistics (issue #238): result writers call `markStatisticsDirty`; `statisticsSync` listens. Dependency-free so repositories can import it without a cycle. */
type Listener = (examId: string) => void;

let listener: Listener | null = null;

export function markStatisticsDirty(examId: string | undefined): void {
  if (examId) listener?.(examId);
}

/** Only `statisticsSync.startStatisticsSync` sets this; null stops listening. */
export function onStatisticsDirty(next: Listener | null): void {
  listener = next;
}
