import type { Translations } from '../types';

export const help: Translations['help'] = {
    ui: {
        title: 'Help',
        navLabel: 'Manual',
        manualTitle: 'Manual',
        manualSubtitle: 'Everything about Examance — from the first exercise to the final analysis.',
        contents: 'Topics',
        searchPlaceholder: 'Search help …',
        noResults: 'No topic matches “{query}”.',
        openManual: 'Open the full manual',
        backToOverview: 'Back to overview',
        openHelpFor: 'Help on: {topic}',
        openHelp: 'Open help',
        statusBarHint: 'Open help (F1)',
        contextTopic: 'Matches this page',
        moreInfo: 'Read more',
        showTip: 'Show explanation',
        onboardingLink: 'Open the manual',
        onboardingCta: 'New here? How Examance works',
        onboardingHint: 'A short overview of storage, exercises, scanning and grading.',
        unlockLink: 'New here? How Examance works',
    },
    tips: {
        storageLocal:
            'Everything stays encrypted in this device’s browser. Not a single byte reaches a server — but there is no sync and no backup other than the .bgproj archive.',
        storageServer:
            'All data is synced, but only ever as ciphertext. The key stays in the browser, so the server cannot read the contents.',
        storageHybrid:
            'Exercises and exam templates live on the server (useful for a shared department catalogue), while student data and grading results stay strictly local.',
        latexLocal:
            'The exam is typeset in the browser (WebAssembly XeLaTeX). The LaTeX source never leaves the device, but the first run takes longer.',
        latexServer:
            'The server typesets the exam. Faster on low-spec hardware, but the LaTeX source is transmitted.',
        variantKey:
            'Variants are different phrasings of the same exercise (group A/B/C). They share grading and statistics while making copying harder.',
        mcPenalty:
            'Points deducted for a wrongly ticked option. 0 means no negative marking. An exercise total never drops below zero.',
        blindGrading:
            'During grading only the pseudonym is shown, never the name. Result and person are re-linked only after the grading pass.',
        pseudonymQr:
            'Every sheet carries a QR code for exam, variant and student slot. Scanning splits the stack along those codes and assigns the pages automatically.',
        gradingKey:
            'The grading key decides which score earns which grade — linear, upper-secondary weighted, or with your own cutoffs.',
    },
    topics: {
        gettingStarted: {
            title: 'Getting started',
            summary: 'The whole path, from the first exercise to the finished analysis.',
            s1: {
                h: 'What Examance does',
                p1: 'Examance covers an exam end to end: collect exercises, typeset the exam, import the scanned sheets, grade them anonymously, and analyse the results.',
                p2: 'All sensitive data is encrypted in the browser before it is stored. The key is derived from your password and never leaves the device.',
            },
            s2: {
                h: 'The usual workflow',
                l1: 'Create exercises in the library, or reuse existing ones.',
                l2: 'Assemble an exam, set the grading key and typeset it as a PDF.',
                l3: 'Have the printed, QR-coded sheets written, then scan the stack into a single PDF.',
                l4: 'Import the scan — Examance splits and assigns the sheets by their QR codes.',
                l5: 'Grade anonymously, then analyse or export the results.',
            },
            s3: {
                h: 'Back up your workspace',
                p1: 'In local mode all data lives in this browser only. Export the workspace regularly as a password-protected .bgproj archive — that is also how you move it to another device.',
            },
        },
        storageModes: {
            title: 'Storage & encryption',
            summary: 'Where your data lives — local, on the server, or a mix.',
            s1: {
                h: 'The three storage strategies',
                l1: 'All local (default): exams, exercises, student data and scans stay encrypted in the browser. No byte reaches a server.',
                l2: 'All server: everything is synced, but only as AES-256-GCM ciphertext. The server stores the blobs; it cannot read them.',
                l3: 'Hybrid: the exercise library and exam templates live on the server, while student data and grading results stay local.',
            },
            s2: {
                h: 'What is encrypted',
                p1: 'The content is encrypted: exercise and exam text, student data, scans, annotations and scores. Only technical link fields such as ids and orderings stay in plain text.',
                p2: 'Without the password the stored data cannot be recovered — not even by whoever runs the server. A forgotten password means the local workspace is lost.',
            },
            s3: {
                h: 'Switching strategy',
                p1: 'You can change the storage strategy at any time in Settings. Existing data is carried over into the new mode.',
            },
        },
        exercises: {
            title: 'Exercise library',
            summary: 'Create, tag and maintain exercises, with variants and versions.',
            s1: {
                h: 'Collect instead of copy',
                p1: 'Exercises live in a shared library, tagged by grade, subject and topic. Each one is a LaTeX fragment with a live preview; its score is read from the source automatically.',
                p2: 'Use the filters at the top to narrow the library by grade, subject and topic and reuse an exercise in a new exam.',
            },
            s2: {
                h: 'Variants and versions',
                p1: 'Variants are equivalent phrasings of the same exercise, e.g. for groups A and B. They are analysed together but make copying harder.',
                p2: 'Versions record the revision history: a reworked exercise replaces the old one without invalidating the analysis of past exams.',
            },
            s3: {
                h: 'Multiple choice',
                p1: 'An exercise can be free text, single choice or multiple choice. Tick-box exercises store their options, the correct answers and an optional penalty.',
                p2: 'Several tick-box exercises can be combined into an MC group. That is layout information for the printout only — grading and statistics stay strictly per question.',
            },
            s4: {
                h: 'Images and files',
                p1: 'You can attach files that the LaTeX source references, e.g. figures via \\includegraphics. SVG is not supported — convert it to PDF first.',
                p2: 'A missing graphic does not abort the run: the exam is still typeset, but the missing file is reported. Check the preview before printing.',
            },
        },
        examCreation: {
            title: 'Creating an exam',
            summary: 'Header data, exercise selection, grading key and the PDF run.',
            s1: {
                h: 'Header data',
                p1: 'Subject, class, exam type, date and number appear on the cover sheet. These are exam content and are therefore always printed in German, whatever language the interface is in.',
            },
            s2: {
                h: 'Assembling exercises',
                p1: 'Exercises come from the library, or can be created as one-offs inside the exam. Drag and drop reorders them, and the total score is recalculated as you go.',
            },
            s3: {
                h: 'Grading key',
                p1: 'The grading key decides which score earns which grade: linear, weighted by upper-secondary points, or with cutoffs you set yourself for grades 1 to 6.',
            },
            s4: {
                h: 'Typeset and print',
                p1: 'The run produces a print-ready PDF with QR codes — one per exam, variant and student slot. In local mode it happens entirely in the browser.',
                p2: 'Print the sheets exactly as typeset. The QR code has to stay readable, otherwise the scan cannot be assigned automatically later.',
            },
        },
        scanning: {
            title: 'Scanning & assignment',
            summary: 'From the paper stack to an assigned, encrypted sheet.',
            s1: {
                h: 'Importing the stack',
                p1: 'Scan the whole stack into a single PDF on the school copier and upload it here. Examance splits it into individual submissions along the QR codes.',
                p2: 'Every page is encrypted in the browser immediately. In local mode the scan never leaves the device.',
            },
            s2: {
                h: 'Pseudonyms, not names',
                p1: 'The QR code points at a pseudonym, not a name. The link between person and submission is stored separately and restored only after grading.',
            },
            s3: {
                h: 'When assignment fails',
                p1: 'Unreadable or missing QR codes end up in the verification view. There you can assign pages to the right submission by hand, or enter the fallback code printed on the sheet.',
            },
        },
        grading: {
            title: 'Grading',
            summary: 'Annotate the scan anonymously, award points, auto-score multiple choice.',
            s1: {
                h: 'Grading blind',
                p1: 'During the grading pass you see the handwriting and the answer, but not the name. That is the core of the method: the assessment is made without knowing the person.',
            },
            s2: {
                h: 'Annotating',
                p1: 'Correction marks are drawn on a layer above the scan. The original stays untouched and can be shown without annotations at any time.',
                p2: 'Points are awarded per exercise. Total score and grade follow continuously from the configured grading key.',
            },
            s3: {
                h: 'Tick-box exercises',
                p1: 'For single and multiple choice, automatic recognition detects the ticked boxes and applies the configured penalty. You can review and correct the result before saving.',
            },
            s4: {
                h: 'Work in progress',
                p1: 'Grading progress is saved continuously. Leaving the page with unsaved annotations is intercepted — only confirm that prompt if you really want to discard them.',
            },
        },
        stats: {
            title: 'Exam analysis',
            summary: 'Grade distribution, per-exercise analysis and export for one exam.',
            s1: {
                h: 'Distribution',
                p1: 'The analysis shows the grade distribution, the average and the spread of the exam, as well as how scores are distributed across all submissions.',
            },
            s2: {
                h: 'Per-exercise analysis',
                p1: 'For every exercise you see the average score achieved. A conspicuously weak value points either to a knowledge gap or to an ambiguously worded exercise.',
            },
            s3: {
                h: 'Export',
                p1: 'Results can be exported as CSV or XLSX, e.g. for the school’s grade management system. The export contains real names — handle the file accordingly.',
            },
        },
        analytics: {
            title: 'Cross-exam analytics',
            summary: 'Topic heatmaps, exercise quality and variant fairness across exams.',
            s1: {
                h: 'Across exams',
                p1: 'The analytics view combines several exams and shows how results develop over time, across grades and across subjects.',
            },
            s2: {
                h: 'Topics and knowledge gaps',
                p1: 'The topic heatmap shows where points are lost repeatedly — independently of any single exam.',
            },
            s3: {
                h: 'Variant fairness',
                p1: 'For exercises with variants it compares whether one phrasing was systematically harder than the other. That is the basis for reworking an unfair variant.',
            },
        },
        settings: {
            title: 'Settings',
            summary: 'Storage strategy, LaTeX compilation, language and data deletion.',
            s1: {
                h: 'Storage strategy',
                p1: 'Decides where exercises, exams and student data are stored. The default is the strictly local mode.',
            },
            s2: {
                h: 'LaTeX compilation',
                p1: 'Independently of that, you choose where the exam is typeset: in the browser (nothing leaves the device, but the first run is slower) or on the server (faster on low-spec hardware).',
                p2: 'The first run in the browser downloads the LaTeX environment. If it fails with a message about a missing .sty file, retry once the download has finished.',
            },
            s3: {
                h: 'Language',
                p1: 'The interface is available in German and English, switchable here or from the status bar. The printed exam is unaffected — it is always in German.',
            },
            s4: {
                h: 'Session and deletion',
                p1: 'The session locks itself after a period of inactivity; afterwards the content is reachable only with the password again.',
                p2: 'Data deletion removes individual student records (GDPR access and erasure requests) or the entire workspace. Deletion is final and cannot be undone.',
            },
        },
        security: {
            title: 'Sign-in & security',
            summary: 'Check and change your factors, change your password, replace your codes.',
            s1: {
                h: 'What this page shows',
                p1: 'For every factor it says whether it is set up, when it was last used, and whether it can also open your encrypted data. An authenticator app cannot: its secret lives on the server, and six digits carry no entropy to derive a key from.',
            },
            s2: {
                h: 'Changing your password',
                p1: 'You can change your password here directly, without going through "forgot password". Your data key is re-wrapped in the browser and stored together with the new password — nothing is re-encrypted, and you stay signed in.',
                p2: 'Other devices are signed out. Your passkeys and your recovery code stay valid.',
            },
            s3: {
                h: 'Backup codes and the recovery code',
                p1: 'Backup codes stand in for the authenticator app when your phone is not to hand. Each works exactly once; generate new ones while you are still signed in.',
                p2: 'The recovery code is a different thing: it opens your encrypted data if you forget your password. You can replace it here — the previous one stops working.',
            },
            s4: {
                h: 'Removing a factor',
                p1: 'A factor can only be removed while two would remain afterwards and at least one of those can open your data. When a removal is refused, the message says which of the two rules it hit.',
            },
        },
        accounts: {
            title: 'Accounts & roles',
            summary: 'When an account is needed, which roles exist, how passwords are reset.',
            s1: {
                h: 'Do you need an account?',
                p1: 'Not in strictly local mode: the workspace is protected by a password only. An account is required once data is to be synced through a server.',
            },
            s2: {
                h: 'Roles',
                p1: 'Teachers see only their own exams. Administrators additionally manage the school’s accounts — which gives them no access to anyone else’s exam content, because that is encrypted client-side.',
            },
            s6: {
                h: 'Two sign-in factors',
                p1: 'Every sign-in presents two of three factors: password, authenticator app, passkey. A guessed password on its own gets nowhere.',
                p2: 'Enrol all three where you can — then losing one is merely inconvenient. With exactly two, losing one means only an administrator can get you back in, and only to the account, not to the encrypted data. Backup codes stand in for the authenticator app and work once each.',
            },
            s7: {
                h: 'Passkeys',
                p1: 'A passkey signs you in with a fingerprint, your face or a device PIN — no password. It counts as one of the two required factors, not as a replacement for both.',
                p2: 'Whether a passkey can also open your encrypted data depends on the device. Settings shows this per passkey. Where it cannot, your password and recovery code stay responsible for that.',
            },
            s3: {
                h: 'Resetting a password',
                p1: 'A server account can be reset via “forgot password”. You confirm with a second factor, then enter your recovery code once so your existing encrypted data becomes readable again — nothing is re-encrypted.',
            },
            s4: {
                h: 'Recovery code',
                p1: 'The code is shown exactly once: when your key is first stored, and again after every reset. Keep it outside the browser — on paper, or in a password manager.',
                p2: 'Without this code and without your old password, exams, student data and grading that are already encrypted stay permanently unreadable. Your school administrator cannot restore them either, because the server never knows the key. Anything you create afterwards is unaffected.',
            },
            s5: {
                h: 'Too many failed attempts',
                p1: 'After several wrong passwords the account is locked briefly; the wait grows with each further failure and ends by itself. If you see this without having caused it, somebody else is trying to sign in to your account.',
            },
        },
        privacy: {
            title: 'Privacy & security',
            summary: 'What is encrypted, what protects the session, how long data is kept.',
            s1: {
                h: 'Zero knowledge',
                p1: 'The key is derived from your password in the browser (Argon2id, HKDF-SHA-256) and is never transmitted. Encryption is AES-256-GCM, applied before anything is written or sent.',
                p2: 'A server therefore only ever sees ciphertext. Even if the server database were breached, exam and student data stay unreadable.',
            },
            s2: {
                h: 'Session hygiene',
                p1: 'Lock the session when you leave the computer — no decrypted data remains in memory afterwards. After a longer idle period this happens automatically.',
            },
            s3: {
                h: 'Retention',
                p1: 'Exams carry a retention period, after which they can be removed. Student-related data can be deleted individually without losing the exam’s statistics.',
            },
            s4: {
                h: 'No password, no data',
                p1: 'There is no back door and no recovery. Lose the password to a local workspace and its content is gone for good — so export a .bgproj archive regularly.',
            },
        },
    },
};
