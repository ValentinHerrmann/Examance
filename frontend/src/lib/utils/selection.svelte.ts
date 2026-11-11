/** A list's checkbox selection by id (Students table, exam list, exercise library; issue #261). Reassigns its Set, so readers stay reactive. */
export class Selection {
  ids = $state.raw(new Set<string>());

  get size(): number {
    return this.ids.size;
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  toggle(id: string, on: boolean): void {
    const next = new Set(this.ids);
    if (on) next.add(id);
    else next.delete(id);
    this.ids = next;
  }

  set(ids: Iterable<string>): void {
    this.ids = new Set(ids);
  }

  clear(): void {
    if (this.ids.size) this.ids = new Set();
  }

  /** Drops ids no longer listed (filtered out or deleted), so an action never hits rows the teacher cannot see. */
  prune(visible: Iterable<string>): void {
    const keep = new Set(visible);
    if ([...this.ids].some((id) => !keep.has(id))) this.ids = new Set([...this.ids].filter((id) => keep.has(id)));
  }
}
