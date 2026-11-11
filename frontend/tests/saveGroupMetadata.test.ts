import { describe, it, expect } from 'vitest';
import { groupMetadataPayload } from '../src/lib/exercise-library/saveGroupMetadata';

describe('groupMetadataPayload', () => {
  it('sends only the given fields', () => {
    expect(groupMetadataPayload({ grade: '8' })).toEqual({ grade: '8' });
  });

  // Regression: the group dialog sent null for an emptied grade, which the server reads as "leave alone".
  it('clears grade and subject with an empty string, not null', () => {
    expect(groupMetadataPayload({ grade: ' ', subject: '' })).toEqual({ grade: '', subject: '' });
  });

  it('falls back to the default topic', () => {
    expect(groupMetadataPayload({ topicTag: '' })).toEqual({ topic_tag: '_General' });
  });
});
