import { beforeEach, describe, expect, it, vi } from 'vitest';

const get = vi.fn();
const getBinary = vi.fn();
vi.mock('#lib/api/client', () => ({ api: { get, getBinary } }));

const bytes = new TextEncoder().encode('hello');
// sha256("hello")
const HELLO = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

beforeEach(() => {
  vi.resetModules();
  get.mockReset();
  getBinary.mockReset();
});

describe('loadLatexAssets', () => {
  it('fetches every listed file through the authenticated client', async () => {
    get.mockResolvedValue({ files: [{ path: 'sty/a.sty', sha256: HELLO }] });
    getBinary.mockResolvedValue(bytes.buffer);
    const { loadLatexAssets } = await import('#lib/latex/assets');
    const assets = await loadLatexAssets();
    expect(getBinary).toHaveBeenCalledWith('/latex-assets/sty/a.sty', { silentError: true });
    expect(assets).toEqual([{ path: 'sty/a.sty', content: bytes }]);
  });

  it('rejects a file that does not match the manifest and retries next time', async () => {
    get.mockResolvedValue({ files: [{ path: 'x.sty', sha256: 'deadbeef' }] });
    getBinary.mockResolvedValue(bytes.buffer);
    const { loadLatexAssets } = await import('#lib/latex/assets');
    await expect(loadLatexAssets()).rejects.toThrow(/manifest/);
    await expect(loadLatexAssets()).rejects.toThrow(/manifest/);
    expect(get).toHaveBeenCalledTimes(2);
  });
});
