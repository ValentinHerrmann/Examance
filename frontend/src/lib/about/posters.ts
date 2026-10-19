/**
 * The info posters from `docs/posters/` (issue #119), bundled at build time like the release notes:
 * every build ships the PDFs committed in the repo, served from our own origin (never fetched from GitHub).
 */
import infoPdf from '../../../../docs/posters/examance-info.pdf?url';
import uiPdf from '../../../../docs/posters/examance-ui.pdf?url';

export type PosterId = 'info' | 'ui';

export interface Poster {
  id: PosterId;
  url: string;
  fileName: string;
}

export const POSTERS: readonly Poster[] = [
  { id: 'info', url: infoPdf, fileName: 'examance-info.pdf' },
  { id: 'ui', url: uiPdf, fileName: 'examance-ui.pdf' },
];

export function posterById(id: string | null | undefined): Poster {
  return POSTERS.find((p) => p.id === id) ?? POSTERS[0];
}
