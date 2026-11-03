import { describe, it, expect, vi } from 'vitest';

const overrides = vi.hoisted(() => ({ value: null as null | { locateFile: (path: string, prefix: string) => string } }));
vi.mock('zxing-wasm/reader', () => ({
  readBarcodesFromImageData: vi.fn(),
  setZXingModuleOverrides: (o: typeof overrides.value) => {
    overrides.value = o;
  },
}));
vi.stubGlobal('self', { location: { href: 'https://app.example.test/_app/immutable/workers/qrWorker.js' } });

const { qrResultOf } = await import('#lib/workers/qrWorker');

describe('qrWorker', () => {
  // Regression: left at its default, zxing-wasm fetched the WASM from jsDelivr, CSP blocked it and no QR code was ever read.
  it('loads the ZXing WASM from the app origin, never a CDN', () => {
    const url = overrides.value?.locateFile('zxing_reader.wasm', 'https://fastly.jsdelivr.net/npm/zxing-wasm/dist/reader/');
    expect(url).toBeDefined();
    expect(new URL(url!).origin).toBe('https://app.example.test');
    expect(url).not.toContain('jsdelivr');
  });

  it('splits BG codes and keeps sticker payloads whole', () => {
    expect(qrResultOf('BG:abc:2:F-1')).toMatchObject({ pseudonymId: 'abc', version: '2', fallbackCode: 'F-1' });
    expect(qrResultOf('Müller, Anna_123')).toMatchObject({ pseudonymId: 'Müller, Anna_123', version: 'A', rawText: 'Müller, Anna_123' });
  });
});
