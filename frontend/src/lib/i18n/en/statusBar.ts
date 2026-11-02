import type { Translations } from '../types';

export const statusBar: Translations['statusBar'] = {
    languageHint: 'Switch language ({language})',
    previewBanner: 'Preview',
    versionMatch: 'App and server both run v{version}',
    versionMismatch: 'App v{version} — versions differ but stay compatible',
    versionIncompatible: 'App v{version} — incompatible major version',
    versionUnknown: 'App v{version} — server version unavailable',
    linkPullRequest: 'open pull request on GitHub',
    linkCommit: 'open build commit on GitHub',
    linkRelease: 'open release on GitHub',
    incompatibleTitle: 'Incompatible server version',
    incompatibleBody: 'This app (v{app}) and the server (v{server}) run different major versions. Saving may fail. Reload the page or contact your administrator.',
    mismatchShort: 'Versions differ',
    updateTitle: 'A new version is available',
    updateBody: 'Reload to get the latest version. Unsaved work in open editors may be lost.',
    updateReload: 'Reload now',
    releaseNotesTitle: 'Updated to v{version}',
    releaseNotesLink: 'View release notes on GitHub',
};
