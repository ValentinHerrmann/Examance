import { afterEach, describe, expect, it } from 'vitest';
import { capabilitiesStore } from '../src/lib/stores/capabilities';
import { fallBackToServer, LocalEngineFailedError, LocalEngineUnavailableError } from '../src/lib/latex/compiler';
import { LatexCompileError } from '../src/lib/latex/compileError';

function allowServer(on: boolean) {
  capabilitiesStore.set({ accountId: null, storageMode: null, allowedStorageModes: [], features: { server_latex: on } });
}

describe('fallBackToServer', () => {
  afterEach(() => capabilitiesStore.set(null));

  it('never sends a LaTeX error to the server: it would fail there too', () => {
    allowServer(true);
    expect(fallBackToServer(new LatexCompileError('Undefined control sequence', 'log', 'local'))).toBe(false);
    expect(fallBackToServer(new Error('other'))).toBe(false);
  });

  it('compiles an engine failure on the server when the account may', () => {
    allowServer(true);
    expect(fallBackToServer(new LocalEngineFailedError('worker crashed'))).toBe(true);
    expect(fallBackToServer(new LocalEngineUnavailableError('no memory'))).toBe(true);
  });

  it('explains an engine that cannot run when the server is not allowed', () => {
    allowServer(false);
    expect(fallBackToServer(new LocalEngineFailedError('worker crashed'))).toBe(false);
    expect(() => fallBackToServer(new LocalEngineUnavailableError('no memory'))).toThrow();
  });
});
