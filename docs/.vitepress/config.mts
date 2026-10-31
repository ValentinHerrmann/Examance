import { existsSync } from 'node:fs';
import { dirname, posix, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitepress';

// Published from the `release` branch by .github/workflows/docs.yml (issue #174).
const REPO_URL = 'https://github.com/ValentinHerrmann/Examance';
const DOCS_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(DOCS_ROOT, '..');

// Marp slide sources and demo-instance tooling are not pages; the site links their PDFs and sources on GitHub.
const SRC_EXCLUDE = ['demo-instance/**', 'pitches/**', 'posters/**', 'screenshots/**', 'node_modules/**', 'README.md'];

const EXCLUDED_DIRS = ['demo-instance/', 'pitches/', 'posters/', 'screenshots/'];

/** Rewrites a relative link that is not a site page (source file, PDF, excluded page) to its GitHub copy on `release`. */
function toGithubHref(href: string, pageRelPath: string): string | null {
  if (/^([a-z][a-z0-9+.-]*:|#|\/)/i.test(href)) return null;
  const [path, hash = ''] = href.split('#', 2);
  if (!path) return null;
  const target = posix.normalize(posix.join(posix.dirname(pageRelPath), path));
  const insideDocs = !target.startsWith('../');
  const isPage = target.endsWith('.md') && insideDocs && !EXCLUDED_DIRS.some((d) => target.startsWith(d));
  const isImage = /\.(png|jpe?g|gif|webp|svg)$/i.test(target);
  if (isPage || (isImage && insideDocs)) return null;
  const repoPath = relative(REPO_ROOT, resolve(DOCS_ROOT, target)).split('\\').join('/');
  if (!existsSync(resolve(REPO_ROOT, repoPath))) return null;
  const kind = repoPath.endsWith('/') || !/\.[a-z0-9]+$/i.test(repoPath) ? 'tree' : 'blob';
  return `${REPO_URL}/${kind}/release/${repoPath}${hash ? `#${hash}` : ''}`;
}

export default defineConfig({
  title: 'Examance',
  description: 'Privacy-first anonymous exam grading: user, operator and developer documentation.',
  base: '/Examance/',
  srcExclude: SRC_EXCLUDE,
  cleanUrls: true,
  head: [['link', { rel: 'icon', type: 'image/png', href: '/Examance/logo.png' }]],
  markdown: {
    languageAlias: { env: 'dotenv' },
    config(md) {
      md.core.ruler.after('inline', 'examance-github-links', (state) => {
        const pageRelPath: string = state.env.relativePath ?? '';
        for (const block of state.tokens) {
          for (const token of block.children ?? []) {
            if (token.type !== 'link_open') continue;
            const href = token.attrGet('href');
            const rewritten = href ? toGithubHref(href, pageRelPath) : null;
            if (rewritten) {
              token.attrSet('href', rewritten);
              token.attrSet('target', '_blank');
              token.attrSet('rel', 'noreferrer');
            }
          }
        }
      });
    },
  },
  themeConfig: {
    logo: '/logo.png',
    nav: [
      { text: 'User guide', link: '/user/' },
      { text: 'Operate', link: '/deployment' },
      { text: 'Develop', link: '/data_flow_and_security' },
      { text: 'Legal', link: '/legal_audit_dsgvo' },
    ],
    sidebar: [
      {
        text: 'User guide',
        items: [
          { text: 'Getting started', link: '/user/' },
          { text: 'From exercise to analysis', link: '/user/workflow' },
          { text: 'Pitch decks and posters', link: '/concept_pitch' },
        ],
      },
      {
        text: 'Operate',
        items: [
          { text: 'Deployment', link: '/deployment' },
          { text: 'Accounts and administration', link: '/account_creation_and_management' },
          { text: 'Backup and restore', link: '/backup_and_restore' },
          { text: 'Maintenance mode', link: '/dev/maintenance_mode' },
          { text: 'Storage partitions', link: '/dev/storage_partitions' },
        ],
      },
      {
        text: 'Develop',
        collapsed: false,
        items: [
          { text: 'Data flow and security', link: '/data_flow_and_security' },
          { text: 'REST API reference', link: '/api_reference' },
          { text: 'Storage modes', link: '/dev/storage_modes' },
          { text: 'Pseudonym HMAC and AAD', link: '/dev/pseudonym_hmac_and_aad' },
          { text: 'MC and exam data model', link: '/dev/mc_model' },
          { text: 'MC detection (OMR)', link: '/dev/omr' },
          { text: 'LaTeX in the frontend', link: '/dev/latex' },
          { text: 'LaTeX packages', link: '/dev/latex_packages' },
          { text: 'Exercise sharing', link: '/dev/exercise_sharing' },
          { text: 'UI shell and overview lists', link: '/dev/ui_shell' },
          { text: 'Build and CSP', link: '/dev/build_and_csp' },
          { text: 'CI and dependency audit', link: '/dev/ci_and_audit' },
          { text: 'Training-data donation', link: '/dev/training_donation' },
          { text: 'Third-party licenses and SRI', link: '/THIRD_PARTY_LICENSES' },
          { text: 'Slide sources', link: '/concept_pitch_slides' },
        ],
      },
      {
        text: 'Legal and compliance',
        items: [
          { text: 'Legal audit (start here)', link: '/legal_audit_dsgvo' },
          { text: 'Records of processing (Art. 30)', link: '/records_of_processing_art30' },
          { text: 'DPIA (Art. 35)', link: '/dpia_art35' },
          { text: 'DPA template (Art. 28)', link: '/DPA_template' },
          { text: 'Breach response (Art. 33/34)', link: '/breach_response_checklist' },
        ],
      },
    ],
    search: { provider: 'local' },
    outline: [2, 3],
    editLink: { pattern: `${REPO_URL}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
    socialLinks: [{ icon: 'github', link: REPO_URL }],
    footer: { message: 'Documentation of the latest Examance release.' },
  },
});
