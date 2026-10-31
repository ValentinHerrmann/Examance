import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';
import { copySiteFiles, examanceMarkdown, REPO_URL, siteFilesDevServer, SRC_EXCLUDE } from './markdown';

// Production and previews on Cloudflare (served at /), backup on GitHub Pages (served at /Examance/, DOCS_BASE set by .github/workflows/docs.yml).
const BASE = process.env.DOCS_BASE ?? '/';

export default withMermaid(defineConfig({
  title: 'Examance',
  description: 'Privacy-first anonymous exam grading: user, operator and developer documentation.',
  base: BASE,
  srcExclude: SRC_EXCLUDE,
  cleanUrls: true,
  head: [['link', { rel: 'icon', type: 'image/png', href: `${BASE}logo.png` }]],
  markdown: {
    languageAlias: { env: 'dotenv' },
    config: (md) => examanceMarkdown(md, BASE),
  },
  vite: { plugins: [siteFilesDevServer(BASE)] },
  buildEnd: (siteConfig) => copySiteFiles(siteConfig.outDir),
  themeConfig: {
    logo: '/logo.png',
    nav: [
      { text: 'User guide', link: '/user/' },
      { text: 'Operate', link: '/hosting' },
      { text: 'Develop', link: '/data_flow_and_security' },
      { text: 'Legal', link: '/legal_audit_dsgvo' },
    ],
    sidebar: [
      {
        text: 'User guide',
        items: [
          { text: 'Getting started', link: '/user/' },
          { text: 'From exercise to analysis', link: '/user/workflow' },
          { text: 'Info material (PDF)', link: '/user/material' },
        ],
      },
      {
        text: 'Operate',
        items: [
          {
            text: 'Host Examance',
            items: [
              { text: 'Setup and updates', link: '/hosting' },
              { text: 'Accounts and administration', link: '/account_creation_and_management' },
              { text: 'Backup and restore', link: '/backup_and_restore' },
              { text: 'Maintenance mode', link: '/dev/maintenance_mode' },
              { text: 'Storage partitions', link: '/dev/storage_partitions' },
            ],
          },
          {
            text: 'Like the maintainer: GitHub Actions',
            items: [{ text: 'Release and preview pipeline', link: '/deployment' }],
          },
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
          { text: 'Decks and posters: sources', link: '/concept_pitch' },
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
}));
