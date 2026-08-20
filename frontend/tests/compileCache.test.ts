import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  computeCompileContentHash,
  makeSlotKey,
  getCached,
  getLatestForSlot,
  setCached,
  invalidateSlot,
  invalidateOwner,
  clearCompileCache,
  getCompileCacheStats,
  compileWithCache,
  MAX_CACHE_ENTRIES,
  type CompileCacheKey,
} from '../src/lib/latex/compileCache';
import * as compilerModule from '../src/lib/latex/compiler';
import type { CompileResult } from '../src/lib/latex/compiler';
import type { LatexResourceFile } from '../src/lib/latex/resources';

describe('compileCache', () => {
  beforeEach(() => {
    clearCompileCache();
    vi.restoreAllMocks();
  });

  describe('makeSlotKey and isolation', () => {
    it('isolates exams from exercises with the same id', () => {
      const examKey: CompileCacheKey = { kind: 'exam', id: 'uuid-123', variant: 'angabe' };
      const exerciseKey: CompileCacheKey = { kind: 'exercise', id: 'uuid-123', variant: 'angabe' };

      expect(makeSlotKey(examKey)).toBe('exam:uuid-123:angabe');
      expect(makeSlotKey(exerciseKey)).toBe('exercise:uuid-123:angabe');
      expect(makeSlotKey(examKey)).not.toBe(makeSlotKey(exerciseKey));
    });

    it('isolates angabe from loesung for the same document', () => {
      const angabeKey: CompileCacheKey = { kind: 'exam', id: 'uuid-123', variant: 'angabe' };
      const loesungKey: CompileCacheKey = { kind: 'exam', id: 'uuid-123', variant: 'loesung' };

      expect(makeSlotKey(angabeKey)).toBe('exam:uuid-123:angabe');
      expect(makeSlotKey(loesungKey)).toBe('exam:uuid-123:loesung');
      expect(makeSlotKey(angabeKey)).not.toBe(makeSlotKey(loesungKey));
    });
  });

  describe('computeCompileContentHash', () => {
    const sampleTex = '\\documentclass{article}\\begin{document}Hello\\end{document}';

    it('produces a 64-character hex hash', async () => {
      const hash = await computeCompileContentHash(sampleTex);
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('is deterministic for identical inputs', async () => {
      const hash1 = await computeCompileContentHash(sampleTex, [], [], 'local');
      const hash2 = await computeCompileContentHash(sampleTex, [], [], 'local');
      expect(hash1).toBe(hash2);
    });

    it('changes when LaTeX source changes', async () => {
      const hash1 = await computeCompileContentHash(sampleTex);
      const hash2 = await computeCompileContentHash(sampleTex + ' % modified');
      expect(hash1).not.toBe(hash2);
    });

    it('changes when compile engine changes', async () => {
      const hashLocal = await computeCompileContentHash(sampleTex, [], [], 'local');
      const hashServer = await computeCompileContentHash(sampleTex, [], [], 'server');
      expect(hashLocal).not.toBe(hashServer);
    });

    it('changes when resource files change', async () => {
      const res1: LatexResourceFile = {
        filename: 'img.png',
        content: new Uint8Array([1, 2, 3]),
      };
      const res2: LatexResourceFile = {
        filename: 'img.png',
        content: new Uint8Array([1, 2, 4]),
      };

      const hash1 = await computeCompileContentHash(sampleTex, [res1]);
      const hash2 = await computeCompileContentHash(sampleTex, [res2]);
      const hashNone = await computeCompileContentHash(sampleTex, []);

      expect(hash1).not.toBe(hash2);
      expect(hash1).not.toBe(hashNone);
    });

    it('is independent of resource array ordering', async () => {
      const resA: LatexResourceFile = { filename: 'a.png', content: new Uint8Array([1]) };
      const resB: LatexResourceFile = { filename: 'b.png', content: new Uint8Array([2]) };

      const hash1 = await computeCompileContentHash(sampleTex, [resA, resB]);
      const hash2 = await computeCompileContentHash(sampleTex, [resB, resA]);

      expect(hash1).toBe(hash2);
    });

    it('is independent of resourceExerciseIds ordering', async () => {
      const hash1 = await computeCompileContentHash(sampleTex, [], ['id-1', 'id-2']);
      const hash2 = await computeCompileContentHash(sampleTex, [], ['id-2', 'id-1']);

      expect(hash1).toBe(hash2);
    });
  });

  describe('getCached, getLatestForSlot, and setCached', () => {
    const key: CompileCacheKey = { kind: 'exam', id: 'ex-1', variant: 'angabe' };
    const fakePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
    const fakeResult: CompileResult = {
      pdfBytes: fakePdf,
      usedFallback: false,
      engineUsed: 'local',
      missingGraphics: ['missing.png'],
    };

    it('returns cached entry on exact hash match', () => {
      setCached(key, 'hash-abc', fakeResult);

      const hit = getCached(key, 'hash-abc');
      expect(hit).toBeDefined();
      expect(hit?.pdfBytes).toEqual(fakePdf);
      expect(hit?.missingGraphics).toEqual(['missing.png']);
      expect(hit?.engineUsed).toBe('local');
    });

    it('returns undefined on hash mismatch', () => {
      setCached(key, 'hash-abc', fakeResult);

      const miss = getCached(key, 'hash-different');
      expect(miss).toBeUndefined();
    });

    it('getLatestForSlot returns cached entry even without hash', () => {
      setCached(key, 'hash-abc', fakeResult);

      const latest = getLatestForSlot(key);
      expect(latest).toBeDefined();
      expect(latest?.hash).toBe('hash-abc');
      expect(latest?.pdfBytes).toEqual(fakePdf);
    });

    it('overwrites previous entry for the same slot', () => {
      setCached(key, 'hash-1', fakeResult);
      const updatedResult: CompileResult = {
        pdfBytes: new Uint8Array([1, 2, 3, 4, 5]),
        usedFallback: true,
        engineUsed: 'server',
      };
      setCached(key, 'hash-2', updatedResult);

      expect(getCached(key, 'hash-1')).toBeUndefined();
      const hit = getCached(key, 'hash-2');
      expect(hit).toBeDefined();
      expect(hit?.pdfBytes.length).toBe(5);
      expect(hit?.usedFallback).toBe(true);
      expect(getCompileCacheStats().entryCount).toBe(1);
    });
  });

  describe('LRU eviction and budgeting', () => {
    it('evicts the oldest entry when MAX_CACHE_ENTRIES is exceeded', () => {
      for (let i = 0; i <= MAX_CACHE_ENTRIES; i++) {
        const k: CompileCacheKey = { kind: 'exercise', id: `ex-${i}`, variant: 'angabe' };
        setCached(k, `hash-${i}`, {
          pdfBytes: new Uint8Array([i]),
          usedFallback: false,
          engineUsed: 'local',
        });
      }

      const stats = getCompileCacheStats();
      expect(stats.entryCount).toBe(MAX_CACHE_ENTRIES);

      // ex-0 should have been evicted
      expect(getCached({ kind: 'exercise', id: 'ex-0', variant: 'angabe' }, 'hash-0')).toBeUndefined();
      // ex-1 and ex-MAX should be present
      expect(getCached({ kind: 'exercise', id: `ex-${MAX_CACHE_ENTRIES}`, variant: 'angabe' }, `hash-${MAX_CACHE_ENTRIES}`)).toBeDefined();
    });

    it('touching an entry protects it from being the first evicted', () => {
      // Fill to MAX_CACHE_ENTRIES
      for (let i = 0; i < MAX_CACHE_ENTRIES; i++) {
        const k: CompileCacheKey = { kind: 'exercise', id: `ex-${i}`, variant: 'angabe' };
        setCached(k, `hash-${i}`, {
          pdfBytes: new Uint8Array([i]),
          usedFallback: false,
          engineUsed: 'local',
        });
      }

      // Touch ex-0 via getCached
      getCached({ kind: 'exercise', id: 'ex-0', variant: 'angabe' }, 'hash-0');

      // Add one more entry to trigger eviction
      const extraKey: CompileCacheKey = { kind: 'exercise', id: 'ex-extra', variant: 'angabe' };
      setCached(extraKey, 'hash-extra', {
        pdfBytes: new Uint8Array([99]),
        usedFallback: false,
        engineUsed: 'local',
      });

      // ex-0 was touched so it is NOT oldest; ex-1 was oldest and should be evicted
      expect(getCached({ kind: 'exercise', id: 'ex-0', variant: 'angabe' }, 'hash-0')).toBeDefined();
      expect(getCached({ kind: 'exercise', id: 'ex-1', variant: 'angabe' }, 'hash-1')).toBeUndefined();
    });
  });

  describe('invalidation and clearing', () => {
    it('invalidateSlot removes only the targeted variant', () => {
      const angabeKey: CompileCacheKey = { kind: 'exam', id: 'exam-1', variant: 'angabe' };
      const loesungKey: CompileCacheKey = { kind: 'exam', id: 'exam-1', variant: 'loesung' };

      setCached(angabeKey, 'hash-a', { pdfBytes: new Uint8Array([1]), usedFallback: false, engineUsed: 'local' });
      setCached(loesungKey, 'hash-l', { pdfBytes: new Uint8Array([2]), usedFallback: false, engineUsed: 'local' });

      invalidateSlot(angabeKey);

      expect(getCached(angabeKey, 'hash-a')).toBeUndefined();
      expect(getCached(loesungKey, 'hash-l')).toBeDefined();
    });

    it('invalidateOwner removes all variants for the given owner', () => {
      const angabeKey: CompileCacheKey = { kind: 'exam', id: 'exam-1', variant: 'angabe' };
      const loesungKey: CompileCacheKey = { kind: 'exam', id: 'exam-1', variant: 'loesung' };
      const otherExamKey: CompileCacheKey = { kind: 'exam', id: 'exam-2', variant: 'angabe' };

      setCached(angabeKey, 'hash-a', { pdfBytes: new Uint8Array([1]), usedFallback: false, engineUsed: 'local' });
      setCached(loesungKey, 'hash-l', { pdfBytes: new Uint8Array([2]), usedFallback: false, engineUsed: 'local' });
      setCached(otherExamKey, 'hash-o', { pdfBytes: new Uint8Array([3]), usedFallback: false, engineUsed: 'local' });

      invalidateOwner('exam', 'exam-1');

      expect(getCached(angabeKey, 'hash-a')).toBeUndefined();
      expect(getCached(loesungKey, 'hash-l')).toBeUndefined();
      expect(getCached(otherExamKey, 'hash-o')).toBeDefined();
    });

    it('clearCompileCache empties the cache completely', () => {
      setCached({ kind: 'exam', id: 'e1', variant: 'angabe' }, 'h1', { pdfBytes: new Uint8Array([1, 2]), usedFallback: false, engineUsed: 'local' });
      setCached({ kind: 'exercise', id: 'x1', variant: 'loesung' }, 'h2', { pdfBytes: new Uint8Array([3, 4]), usedFallback: false, engineUsed: 'server' });

      expect(getCompileCacheStats().entryCount).toBe(2);
      expect(getCompileCacheStats().totalBytes).toBe(4);

      clearCompileCache();

      expect(getCompileCacheStats().entryCount).toBe(0);
      expect(getCompileCacheStats().totalBytes).toBe(0);
    });
  });

  describe('compileWithCache', () => {
    it('calls compileLatex on cache miss and reuses result on subsequent calls', async () => {
      const compileSpy = vi.spyOn(compilerModule, 'compileLatex').mockResolvedValue({
        pdfBytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        usedFallback: false,
        engineUsed: 'local',
        missingGraphics: [],
      });

      const key: CompileCacheKey = { kind: 'exercise', id: 'ex-123', variant: 'angabe' };
      const source = '\\documentclass{article}\\begin{document}Question 1\\end{document}';

      // First run: cache miss -> compiles
      const res1 = await compileWithCache(key, source, true);
      expect(compileSpy).toHaveBeenCalledTimes(1);
      expect(res1.pdfBytes).toEqual(new Uint8Array([0x25, 0x50, 0x44, 0x46]));

      // Second run with same parameters: cache hit -> does not compile
      const res2 = await compileWithCache(key, source, true);
      expect(compileSpy).toHaveBeenCalledTimes(1);
      expect(res2.pdfBytes).toEqual(res1.pdfBytes);

      // Third run with modified LaTeX: cache miss -> compiles again
      const res3 = await compileWithCache(key, source + ' extra', true);
      expect(compileSpy).toHaveBeenCalledTimes(2);
    });
  });
});
