/**
 * The bundled LaTeX assets (`backend/latex-assets`), fetched from the authenticated
 * `/latex-assets` endpoint so local and server compiles use identical files. Main thread only:
 * the worker cannot refresh a session, so `compiler.ts` hands it the result.
 */
import { api } from '#lib/api/client';

export type LatexAsset = { path: string; content: Uint8Array };
type AssetIndex = { files: { path: string; sha256: string }[] };

let indexPromise: Promise<AssetIndex> | null = null;
let assetsPromise: Promise<LatexAsset[]> | null = null;

// A failure is not cached, so the next call retries instead of inheriting a rejection.
function cached<T>(get: () => Promise<T> | null, set: (p: Promise<T> | null) => void, load: () => Promise<T>): Promise<T> {
  const existing = get();
  if (existing) return existing;
  const p = load().catch((err) => {
    set(null);
    throw err;
  });
  set(p);
  return p;
}

export function fetchAssetIndex(): Promise<AssetIndex> {
  return cached(
    () => indexPromise,
    (p) => (indexPromise = p),
    () => api.get<AssetIndex>('/latex-assets/index.json', { silentError: true })
  );
}

async function sha256Hex(data: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function loadLatexAssets(): Promise<LatexAsset[]> {
  return cached(
    () => assetsPromise,
    (p) => (assetsPromise = p),
    async () => {
      // A failed load drops the index too, so a stale manifest is re-fetched on retry.
      const { files } = await fetchAssetIndex();
      return Promise.all(
        files.map(async ({ path, sha256 }) => {
          const buffer = await api.getBinary(`/latex-assets/${path}`, { silentError: true });
          if ((await sha256Hex(buffer)) !== sha256) {
            throw new Error(`LaTeX asset '${path}' does not match the server manifest.`);
          }
          return { path, content: new Uint8Array(buffer) };
        })
      ).catch((err) => {
        indexPromise = null;
        throw err;
      });
    }
  );
}
