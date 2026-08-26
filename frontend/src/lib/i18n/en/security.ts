import type { Translations } from '../types';

export const security: Translations['security'] = {
    recovery: {
        title: 'Recovery code',
        intro:
            'This code is the only way back to your encrypted data if you forget your password. It is shown exactly once and cannot be retrieved afterwards.',
        warning:
            'Without this code and without your password, your exams, student data and grading become permanently unreadable. An administrator cannot restore them either.',
        copy: 'Copy code',
        copied: 'Copied',
        download: 'Save as file',
        confirmLabel: 'I have stored this code somewhere safe.',
        confirm: 'Continue',
        regenerate: 'Generate a new recovery code',
        regenerateHint:
            'The previous code stops working. Use this if you have mislaid the old one.',
        fileName: 'examance-recovery-code.txt',
    },
    unlock: {
        title: 'Restore access to your encrypted data',
        intro:
            'Your password was reset. To make your existing exams and student data readable again, we need your recovery code once.',
        label: 'Recovery code',
        placeholder: 'XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX',
        submit: 'Restore access',
        working: 'Checking…',
        wrong: 'That recovery code does not match this account.',
        skip: 'Continue without restoring',
        skipWarning:
            'Without the code your existing encrypted data stays unreadable. Data created from now on is unaffected.',
    },
    envelope: {
        changedTitle: 'Stored key copy has changed',
        changedBody:
            'The key copy held on the server differs from the one this browser knows. That normally happens after a password reset on another device. If you did not do this, do not sign in and contact your administrator.',
        changedAccept: 'I reset the password myself — continue',
        missingPassword:
            'No usable password copy of the key is stored for this account. Please restore access with your recovery code.',
        migrating: 'Storing your key copy once…',
    },
};
