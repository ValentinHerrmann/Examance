import { describe, it, expect } from 'vitest';
import { commitStagedGroup, stagingChanged, type McGroupDraft } from '../src/lib/exam/mcGroupStaging';

const groups: McGroupDraft[] = [
  { id: 'g1', title: 'A', scoringText: 's', memberIds: ['q1', 'q2'] },
  { id: 'g2', title: 'B', scoringText: 's', memberIds: ['q3'] },
];

describe('commitStagedGroup (#175: applying the dialog adds the staged group)', () => {
  it('returns null when nothing is staged', () => {
    expect(commitStagedGroup(groups, { editingId: null, staged: [], title: 'T', scoringText: 'S' })).toBeNull();
  });

  it('creates a new group with the staged order', () => {
    const res = commitStagedGroup(groups, { editingId: null, staged: ['q5', 'q4'], title: 'T', scoringText: 'S' }, () => 'new');
    expect(res?.groups).toHaveLength(3);
    expect(res?.groups[2]).toEqual({ id: 'new', title: 'T', scoringText: 'S', memberIds: ['q5', 'q4'] });
    expect(res?.memberIds).toEqual(['q5', 'q4']);
    expect([...(res?.previousMemberIds ?? [])]).toEqual([]);
  });

  it('updates the edited group in place and reports its previous members', () => {
    const res = commitStagedGroup(groups, { editingId: 'g1', staged: ['q2', 'q6'], title: 'A2', scoringText: 'S' });
    expect(res?.groups.map((g) => g.id)).toEqual(['g1', 'g2']);
    expect(res?.groups[0]).toMatchObject({ title: 'A2', memberIds: ['q2', 'q6'] });
    expect([...(res?.previousMemberIds ?? [])]).toEqual(['q1', 'q2']);
  });
});

describe('stagingChanged', () => {
  it('is false for an untouched new or edited group', () => {
    expect(stagingChanged([], [])).toBe(false);
    expect(stagingChanged(['q1', 'q2'], ['q1', 'q2'])).toBe(false);
  });

  it('is true for staged questions, removals and reorders', () => {
    expect(stagingChanged(['q1'], [])).toBe(true);
    expect(stagingChanged(['q1'], ['q1', 'q2'])).toBe(true);
    expect(stagingChanged(['q2', 'q1'], ['q1', 'q2'])).toBe(true);
  });
});
