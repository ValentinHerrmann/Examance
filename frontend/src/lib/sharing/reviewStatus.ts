/** Whether a grading review is fully answered (issue #280): an objected item is answered by a reply text or a points change, the thread only when every objected item is. */

export interface AnswerableItem {
  objection: string;
  reply: string;
  pointsBefore: number | null;
  pointsAfter: number | null;
}

/** A missing side of the points is no change: an unknown "before" must not make an untouched item look answered. */
export const itemAnswered = (item: Omit<AnswerableItem, 'objection'>): boolean =>
  item.reply.trim() !== '' || (item.pointsBefore !== null && item.pointsAfter !== null && item.pointsBefore !== item.pointsAfter);

/** Answered and total objected items; items without an objection text do not count. */
export function answeredCount(items: readonly AnswerableItem[]): { answered: number; total: number } {
  const objected = items.filter((i) => i.objection.trim() !== '');
  return { answered: objected.filter(itemAnswered).length, total: objected.length };
}

/** Every objected item answered (true for no objected item at all). */
export function allAnswered(items: readonly AnswerableItem[]): boolean {
  const { answered, total } = answeredCount(items);
  return answered === total;
}

/** The items of a thread held as maps (objections, reply texts, reply points), in the shape `answeredCount` reads. */
export function threadAnswerItems(objections: Record<string, string>, replies: Record<string, string>, points?: Record<string, { before: number | null; after: number | null }>): AnswerableItem[] {
  return Object.keys(objections).map((k) => ({ objection: objections[k] ?? '', reply: replies[k] ?? '', pointsBefore: points?.[k]?.before ?? null, pointsAfter: points?.[k]?.after ?? null }));
}
