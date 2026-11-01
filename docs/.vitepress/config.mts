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
  // German exists only for the user guide (docs/de/user/, same file names and {#anchors} as docs/user/, linked from the in-app help); operator and developer pages stay English.
  locales: {
    root: { label: 'English', lang: 'en' },
    de: {
      label: 'Deutsch',
      lang: 'de',
      link: '/de/user/',
      description: 'Anonyme, datenschutzfreundliche Korrektur von Prüfungen: Benutzerhandbuch.',
      themeConfig: {
        nav: [
          { text: 'Benutzerhandbuch', link: '/de/user/' },
          { text: 'Betrieb & Entwicklung (Englisch)', link: '/hosting' },
        ],
        sidebar: [
          {
            text: 'Benutzerhandbuch',
            items: [
              { text: 'Erste Schritte', link: '/de/user/' },
              { text: 'Von der Aufgabe zur Auswertung', link: '/de/user/workflow' },
              { text: 'Aufgabenbibliothek', link: '/de/user/exercises' },
              { text: 'Aufgaben teilen', link: '/de/user/sharing' },
              { text: 'Prüfung erstellen', link: '/de/user/exams' },
              { text: 'Scannen und Zuordnen', link: '/de/user/scanning' },
              { text: 'Korrigieren', link: '/de/user/grading' },
              { text: 'Ergebnisse und Auswertung', link: '/de/user/results' },
              { text: 'Sichern und Übertragen', link: '/de/user/backup' },
              { text: 'Einstellungen', link: '/de/user/settings' },
              { text: 'Anmeldung und Sicherheit', link: '/de/user/security' },
              { text: 'Für Administratoren', link: '/de/user/admin' },
              { text: 'Infomaterial (PDF)', link: '/de/user/material' },
            ],
          },
          {
            text: 'Betrieb & Entwicklung (Englisch)',
            items: [
              { text: 'Installation und Updates', link: '/hosting' },
              { text: 'Datenfluss und Sicherheit', link: '/data_flow_and_security' },
              { text: 'Rechtliches (DSGVO)', link: '/legal_audit_dsgvo' },
            ],
          },
        ],
        outline: { level: [2, 3], label: 'Auf dieser Seite' },
        docFooter: { prev: 'Vorherige Seite', next: 'Nächste Seite' },
        darkModeSwitchLabel: 'Darstellung',
        lightModeSwitchTitle: 'Zum hellen Modus wechseln',
        darkModeSwitchTitle: 'Zum dunklen Modus wechseln',
        sidebarMenuLabel: 'Menü',
        returnToTopLabel: 'Nach oben',
        langMenuLabel: 'Sprache wechseln',
        notFound: { title: 'Seite nicht gefunden', quote: '', linkText: 'Zum Benutzerhandbuch', linkLabel: 'Zum Benutzerhandbuch' },
        footer: { message: 'Dokumentation der aktuellen Examance-Version.' },
      },
    },
  },
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
          { text: 'Exercise library', link: '/user/exercises' },
          { text: 'Sharing exercises', link: '/user/sharing' },
          { text: 'Creating an exam', link: '/user/exams' },
          { text: 'Scanning and assignment', link: '/user/scanning' },
          { text: 'Grading', link: '/user/grading' },
          { text: 'Results and analysis', link: '/user/results' },
          { text: 'Backup and transfer', link: '/user/backup' },
          { text: 'Settings', link: '/user/settings' },
          { text: 'Sign-in and security', link: '/user/security' },
          { text: 'For administrators', link: '/user/admin' },
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
              { text: 'Moving to a new domain', link: '/domain_move' },
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
          { text: 'Session keys across reloads', link: '/dev/session_key_wrap' },
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
    // Only the user guide is translated, so switching language opens the other locale's start page instead of a missing /de/ copy.
    i18nRouting: false,
    search: {
      provider: 'local',
      options: {
        locales: {
          de: {
            translations: {
              button: { buttonText: 'Suchen', buttonAriaLabel: 'Suchen' },
              modal: {
                noResultsText: 'Keine Ergebnisse für',
                resetButtonTitle: 'Suche zurücksetzen',
                footer: { selectText: 'auswählen', navigateText: 'navigieren', closeText: 'schließen' },
              },
            },
          },
        },
      },
    },
    outline: [2, 3],
    editLink: { pattern: `${REPO_URL}/edit/main/docs/:path`, text: 'Edit this page on GitHub' },
    socialLinks: [{ icon: 'github', link: REPO_URL }],
    footer: { message: 'Documentation of the latest Examance release.' },
  },
}));
