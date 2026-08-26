import { describe, it, expect } from 'vitest';
import { HELP_TOPICS, getHelpTopic, topicForPath } from '../src/lib/help/topics';
import { de } from '../src/lib/i18n/de';
import { en } from '../src/lib/i18n/en';

function resolve(catalog: unknown, key: string): unknown {
  let node: unknown = catalog;
  for (const segment of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[segment];
  }
  return node;
}

/** Every key the registry points at, in order. */
function keysOf(): string[] {
  const keys: string[] = [];
  for (const topic of HELP_TOPICS) {
    keys.push(topic.titleKey, topic.summaryKey);
    for (const section of topic.sections) {
      keys.push(section.headingKey, ...section.bodyKeys, ...(section.bulletKeys ?? []));
    }
  }
  return keys;
}

describe('help topic registry', () => {
  it('has unique topic ids', () => {
    const ids = HELP_TOPICS.map((topic) => topic.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('resolves every referenced key in both catalogs', () => {
    for (const key of keysOf()) {
      expect(typeof resolve(de, key), `de: ${key}`).toBe('string');
      expect(typeof resolve(en, key), `en: ${key}`).toBe('string');
    }
  });

  it('gives every topic at least one section with content', () => {
    for (const topic of HELP_TOPICS) {
      expect(topic.sections.length, topic.id).toBeGreaterThan(0);
      for (const section of topic.sections) {
        const count = section.bodyKeys.length + (section.bulletKeys?.length ?? 0);
        expect(count, `${topic.id} / ${section.headingKey}`).toBeGreaterThan(0);
      }
    }
  });

  it('looks topics up by id', () => {
    expect(getHelpTopic('grading')?.id).toBe('grading');
  });
});

describe('topicForPath', () => {
  const cases: Array<[string, string]> = [
    ['/', 'gettingStarted'],
    ['/exercises', 'exercises'],
    ['/exam/new', 'examCreation'],
    ['/exam/abc-123', 'examCreation'],
    ['/exam/abc-123/scan', 'scanning'],
    ['/exam/abc-123/verify', 'scanning'],
    ['/exam/abc-123/verify-item', 'scanning'],
    ['/exam/abc-123/grade', 'grading'],
    ['/exam/abc-123/manual', 'grading'],
    ['/exam/abc-123/stats', 'stats'],
    ['/analytics', 'analytics'],
    ['/settings', 'settings'],
    ['/admin/users', 'accounts'],
    ['/legal/datenschutz', 'privacy'],
    ['/unlock', 'accounts'],
  ];

  it.each(cases)('%s → %s', (path, expected) => {
    expect(topicForPath(path)).toBe(expected);
  });

  it('every resolved topic exists in the registry', () => {
    for (const [path] of cases) {
      expect(getHelpTopic(topicForPath(path)), path).toBeDefined();
    }
  });
});
