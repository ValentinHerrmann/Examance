import { describe, expect, it } from 'vitest';
import { parseOmrUri, scoreBoxKey } from '../src/lib/grading/omrUri';

describe('parseOmrUri', () => {
  it('reads fiducials, bubbles and redo zones as before', () => {
    expect(parseOmrUri('omr://__fid__/2')).toEqual({ kind: 'fiducial', corner: 2 });
    expect(parseOmrUri('omr://ex-1/3')).toEqual({ kind: 'bubble', exerciseId: 'ex-1', optionIndex: 3, redo: false });
    expect(parseOmrUri('omr://ex-1/3/redo')).toEqual({ kind: 'bubble', exerciseId: 'ex-1', optionIndex: 3, redo: true });
  });

  it('reads every score box kind (issue #187)', () => {
    expect(parseOmrUri('omr://__box__/task/2')).toEqual({ kind: 'box', box: 'task', position: 2 });
    expect(parseOmrUri('omr://__box__/part/2/b')).toEqual({ kind: 'box', box: 'part', position: 2, part: 'b' });
    expect(parseOmrUri('omr://__box__/cell/4')).toEqual({ kind: 'box', box: 'cell', position: 4 });
    expect(parseOmrUri('omr://__box__/sum')).toEqual({ kind: 'box', box: 'sum' });
    expect(parseOmrUri('omr://__box__/grade')).toEqual({ kind: 'box', box: 'grade' });
  });

  it('never reads a score box as a bubble, so older frontends skip them', () => {
    expect(/^omr:\/\/([^/]+)\/(\d+)(\/redo)?$/.test('omr://__box__/task/2')).toBe(false);
    expect(parseOmrUri('omr://__box__/7')).toBeNull();
  });

  it('rejects malformed links', () => {
    expect(parseOmrUri('omr://__fid__/9')).toBeNull();
    expect(parseOmrUri('omr://__box__/part/2')).toBeNull();
    expect(parseOmrUri('https://example.org')).toBeNull();
  });

  it('keys boxes the same way for template and values', () => {
    expect(scoreBoxKey({ box: 'part', position: 1, part: 'a' })).toBe('part/1/a');
    expect(scoreBoxKey({ box: 'cell', position: 3 })).toBe('cell/3');
    expect(scoreBoxKey({ box: 'grade' })).toBe('grade');
  });
});
