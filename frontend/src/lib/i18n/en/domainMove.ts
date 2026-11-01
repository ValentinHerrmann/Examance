import type { Translations } from '../types';

export const domainMove: Translations['domainMove'] = {
    title: 'Examance is moving to {host}',
    body: 'From {date}, this address ({from}) stops working. Move now: it takes a few minutes, and your exams and exercises are already on the server, so they are there right away.',
    howTo: 'How to move',
    openNew: 'Open {host}',
    guideTitle: 'Moving to {host}',
    guideIntro: 'Until {date}, both addresses work with the same account. Go through these steps once, ideally on every device you use Examance on.',
    steps: {
        results: {
            title: 'Hybrid mode only: take your results along first',
            body: 'In hybrid mode your grading results live only in this browser’s storage for this address and do not move by themselves. Before you leave, switch Settings → Global Data Storage Strategy to “All Server” (if available) and switch back on {host}, or back up the workspace (“Back up or share workspace” in the workspace menu) and import the file on {host}.',
        },
        signIn: {
            title: 'Sign in on {host}',
            body: 'Open {host} and sign in with the same e-mail address. Your password manager may not suggest the password there yet: it is saved under {from}.',
        },
        passkey: {
            title: 'With a passkey? Choose “passkey of the old address”',
            body: 'A passkey belongs to its address. On {host}, “Use a passkey of the old address ({from})” signs you in with your existing passkey (Chrome, Edge, Safari). In Firefox, sign in with your password and authenticator code instead; if you lack one of them, set it up here first under Settings → Sign-in & security.',
        },
        dataAccess: {
            title: 'Add a new passkey on {host}',
            body: 'Add a passkey under Settings → Sign-in & security so that it also opens your encrypted data. Until {date}, the old passkey keeps working on {from}.',
        },
        bookmarks: {
            title: 'Renew bookmarks and the installed app',
            body: 'Replace bookmarks with {host} and install the app again from there. Settings only this browser knows (such as the theme or recently used servers) need to be set once more on {host}.',
        },
        cleanup: {
            title: 'After {date}: clean up',
            body: 'Remove the passkeys marked “old address” under Settings → Sign-in & security, and the entry for {from} in your password manager.',
        },
    },
    docs: 'Detailed guide',
    close: 'Close',
    newPasskeyTitle: 'Add a new passkey for {host}',
    newPasskeyBody: 'Your passkeys belong to the old address {from} and stop working after {date}. Add a passkey for {host} now.',
    toSecurity: 'Go to Sign-in & security',
    legacyPasskey: 'Use a passkey of the old address ({from})',
    legacyUnsupported: 'This browser cannot use the old address’s passkey here. Sign in with your password and authenticator code, or once in Chrome, Edge or Safari.',
    passkeyOld: 'Old address ({from}): stops working from {date}.',
    addPasskeyThere: 'Add new passkeys on the new address {host}; passkeys for this address would go away with it.',
};
