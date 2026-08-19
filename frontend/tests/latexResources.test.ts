import 'fake-indexeddb/auto'; // In-memory IndexedDB — must precede the Dexie module
import { beforeEach, describe, expect, it } from 'vitest';

import { db } from '../src/lib/db/db';
import { exerciseResourceRepository } from '../src/lib/repositories/exerciseResourceRepository';
import { storagePolicyStore } from '../src/lib/stores/storagePolicy';

import {
  MAX_COMPILE_RESOURCE_BYTES,
  ResourceError,
  insertSnippetFor,
  mergeResources,
  sanitizeResourceName,
} from '../src/lib/latex/resources';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('sanitizeResourceName', () => {
  it('keeps a plain filename intact', () => {
    expect(sanitizeResourceName('figure.png')).toBe('figure.png');
  });

  it('drops directory components — resources live flat next to main.tex', () => {
    expect(sanitizeResourceName('../../etc/passwd.png')).toBe('passwd.png');
    expect(sanitizeResourceName('C:\\images\\plot.pdf')).toBe('plot.pdf');
  });

  it('replaces characters LaTeX cannot address', () => {
    expect(sanitizeResourceName('Bild 1 (final).PNG')).toBe('Bild_1__final_.PNG');
  });

  it('rejects a name that sanitises down to nothing', () => {
    expect(() => sanitizeResourceName('...')).toThrow(ResourceError);
  });
});

describe('mergeResources', () => {
  it('deduplicates identical files sharing a name', () => {
    const merged = mergeResources([
      { filename: 'fig.png', content: bytes('same'), owner: 'Ex1' },
      { filename: 'fig.png', content: bytes('same'), owner: 'Ex2' },
    ]);
    expect(merged).toHaveLength(1);
  });

  it('refuses different files sharing a name, naming both exercises', () => {
    expect(() =>
      mergeResources([
        { filename: 'fig.png', content: bytes('a'), owner: 'Ex1' },
        { filename: 'fig.png', content: bytes('b'), owner: 'Ex2' },
      ])
    ).toThrow(/Ex1 and Ex2/);
  });

  it('enforces the per-compilation total', () => {
    const big = new Uint8Array(MAX_COMPILE_RESOURCE_BYTES + 1);
    expect(() => mergeResources([{ filename: 'big.bin', content: big }])).toThrow(ResourceError);
  });
});

describe('insertSnippetFor', () => {
  it('uses includegraphics for images and PDFs', () => {
    expect(insertSnippetFor('figure.png')).toContain('\\includegraphics');
    expect(insertSnippetFor('plot.pdf')).toContain('\\includegraphics');
  });

  it('inputs .tex fragments and leaves anything else as a bare name', () => {
    expect(insertSnippetFor('data.tex')).toBe('\\input{data.tex}');
    expect(insertSnippetFor('values.csv')).toBe('values.csv');
  });
});

describe('exercise resource staging', () => {
  const key = null; // No session key: bytes are stored as-is, which is enough here.

  beforeEach(async () => {
    await db.exerciseResources.clear();
    storagePolicyStore.updateSetting('storageMode', 'all-local');
  });

  it('keeps uploads out of the exercise until they are committed', async () => {
    const stagingId = 'staging-1';
    const exerciseId = 'exercise-1';

    await exerciseResourceRepository.stage(stagingId, 'figure.png', 'image/png', bytes('img'), key);
    expect(await exerciseResourceRepository.listLocal(exerciseId)).toHaveLength(0);

    await exerciseResourceRepository.commit(stagingId, exerciseId, key);

    const committed = await exerciseResourceRepository.listLocal(exerciseId);
    expect(committed.map((r) => r.filename)).toEqual(['figure.png']);
    expect(await exerciseResourceRepository.listLocal(stagingId)).toHaveLength(0);
  });

  it('discards a staging area that is never committed', async () => {
    await exerciseResourceRepository.stage('staging-2', 'draft.png', 'image/png', bytes('x'), key);
    await exerciseResourceRepository.deleteForExercise('staging-2');
    expect(await exerciseResourceRepository.listLocal('staging-2')).toHaveLength(0);
  });

  it('seeds a new version from its base without writing back to it', async () => {
    const baseId = 'base-exercise';
    await exerciseResourceRepository.stage(baseId, 'shared.png', 'image/png', bytes('a'), key);

    const stagingId = 'staging-3';
    await exerciseResourceRepository.seedStaging(baseId, stagingId, key);
    await exerciseResourceRepository.stage(stagingId, 'extra.png', 'image/png', bytes('b'), key);
    await exerciseResourceRepository.commit(stagingId, 'new-version', key);

    expect((await exerciseResourceRepository.listLocal(baseId)).map((r) => r.filename)).toEqual([
      'shared.png',
    ]);
    expect(
      (await exerciseResourceRepository.listLocal('new-version')).map((r) => r.filename)
    ).toEqual(['extra.png', 'shared.png']);
  });

  it('re-staging a filename replaces the file instead of duplicating it', async () => {
    await exerciseResourceRepository.stage('staging-4', 'fig.png', 'image/png', bytes('old'), key);
    await exerciseResourceRepository.stage('staging-4', 'fig.png', 'image/png', bytes('newer'), key);

    const rows = await exerciseResourceRepository.listLocal('staging-4');
    expect(rows).toHaveLength(1);
    expect(rows[0].byteSize).toBe(bytes('newer').length);
  });

  it('inlines staged files for a compile, since the server cannot know them', async () => {
    await exerciseResourceRepository.stage('staging-5', 'fig.png', 'image/png', bytes('img'), key);
    const collected = await exerciseResourceRepository.collectForCompile(
      [{ id: 'staging-5', label: 'Aufgabe 1', staged: true }],
      key,
      true
    );
    expect(collected.inline.map((f) => f.filename)).toEqual(['fig.png']);
    expect(collected.exerciseIds).toEqual([]);
  });
});
