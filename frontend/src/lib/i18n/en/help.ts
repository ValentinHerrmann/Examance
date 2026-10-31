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
        moreInfo: 'Read more',
        showTip: 'Show explanation',
        onboardingLink: 'Open the manual',
        onboardingCta: 'New here? How Examance works',
        onboardingHint: 'A short overview of storage, exercises, scanning and grading.',
        unlockLink: 'User guide',
        docsLink: 'More in the documentation',
        docsTopic: 'Documentation on this topic',
    },
    tips: {
        storageServer: 'Exams, exercises and results live on the server, but encrypted: the key stays in the browser, so the server cannot read the contents. Only the LaTeX source of exercises and exams and the total score are unencrypted.',
        storageHybrid: 'Exercises and exams live on the server (useful for a shared department catalogue). Student data, scans and scores stay in this browser only, encrypted, and are not visible on other devices.',
        latexLocal: 'The exam is typeset in the browser (WebAssembly XeLaTeX). The LaTeX source never leaves the device. The engine loads in the background after sign-in or when you switch to this option (one-time download); until then the first run takes longer.',
        latexServer: 'The server typesets the exam. Faster on low-spec hardware, but the LaTeX source is transmitted.',
        variantKey: 'Variants are different phrasings of the same exercise (group A/B/C). They share grading and statistics while making copying harder.',
        mcPenalty: 'Points deducted for a wrongly ticked option. 0 means no negative marking. An exercise total never drops below zero.',
        exerciseScore: String.raw`Counts \BE (1 point), \hBE (0.5) and \qBE (0.25) in the source, and every correct option in MC questions. A fixed score replaces the counted one; clear the field to count again.`,
        requirementLevel: 'Requirement level I: reproduce, II: apply and transfer, III: reflect and solve problems. Shown only on the solution sheet.',
        partExercises: 'Parts a), b), c) get their own subtitle and score box. An empty score counts the part’s scoring units.',
        blindGrading: 'During grading only the pseudonym is shown, never the name. Result and person are re-linked only after the grading pass.',
        pseudonymQr: 'Every sheet carries a QR code for exam, variant and student slot. Scanning splits the stack along those codes and assigns the pages automatically.',
        gradingKey: 'The grading key decides which score earns which grade — linear, upper-secondary weighted, or with your own cutoffs.',
    },
    topics: {
        gettingStarted: {
            title: 'Getting started',
            summary: 'The whole path, from the first exercise to the finished analysis.',
            s1: {
                h: 'What Examance does',
                p1: 'Examance covers an exam end to end: collect exercises, typeset the exam, import the scanned sheets, grade them anonymously, and analyse the results.',
                p2: 'All sensitive data is encrypted in the browser before it is stored. The key is derived from your password and never leaves the device.',
                p3: 'To try things out, "Add example data" in the still empty exam overview creates example exercises, two example exams and graded sheets of invented students. For a quick overview, see the posters under "Posters: features & privacy" on the sign-in page.',
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
                h: 'Help and documentation',
                p1: 'This help gives a quick direction; the ? buttons and F1 open it for the current page. “More in the documentation” leads to the matching section of the user guide, with all details and screenshots.',
                p2: 'Many names are clickable: exercises open straight in the editor, names marked with ↗ open in a new tab, so unsaved work in the current tab stays where it is.',
            },
            s4: {
                h: 'Back up your workspace and share results',
                p1: '“Back up or share workspace” in the workspace menu creates a password-protected .examance archive with all exams, exercises and results; “Export” on an exam backs up just that exam. In hybrid mode this is your main backup. “Without exercise texts (to share results)” passes results on without handing over your exercises.',
            },
        },
        storageModes: {
            title: 'Storage & encryption',
            summary: 'Where your data lives — entirely on the server, or with results only in the browser.',
            s1: {
                h: 'The two storage locations',
                l1: 'All on the server: exams, exercises and results live on the server and are available in every browser of your account, encrypted client-side.',
                l2: 'Hybrid: exercises and exams live on the server; student data, scans and scores only in the browser where they were recorded. Back them up with a .examance archive.',
                l3: 'The storage location belongs to your account and applies in all browsers. You choose it on your first sign-in; there is no default.',
            },
            s2: {
                h: 'What is encrypted',
                p1: 'Student data, names, scans, annotations and scores are encrypted in the browser; the server only sees ciphertext. Technical fields, the LaTeX source of exercises and exams and the total score stay unencrypted. Without your password and recovery code nobody can recover the data.',
            },
            s3: {
                h: 'Changing storage location',
                p1: 'You change the storage location in Settings (the “Data” label in the navigation bar). Examance moves the results exam by exam, checks that everything arrived, and then asks whether to keep or delete the old copy. Changes not yet sent must be sent first (“Send now”).',
            },
            s4: {
                h: 'Notices about local data',
                p1: 'A browser’s storage always belongs to exactly one account on one server. If it holds data of another account, from earlier hybrid use or from the former purely local mode, a notice explains what to do.',
            },
        },
        exercises: {
            title: 'Exercise library',
            summary: 'Create, tag and maintain exercises, with variants and versions, and share them with others.',
            s1: {
                h: 'Collect instead of copy',
                p1: 'Exercises live in your library, tagged by grade, subject and topic. The filters at the top narrow it down, “Sort by” orders it. An expanded entry shows which exams use the exercise; “Preview” shows the last compiled PDF.',
            },
            s2: {
                h: 'The editor',
                p1: 'Each exercise is a LaTeX fragment with a live preview. “Insert LaTeX snippets” above the source offers snippets for solutions, scoring and formatting, plus subject-specific ones such as tree diagrams, circuits or structural formulas. Ctrl + F searches, Ctrl + H replaces.',
            },
            s3: {
                h: 'Scores, part exercises and requirement levels',
                p1: String.raw`The score is counted from the source: \BE is one point, \hBE half a point, \qBE a quarter, and every correct MC option one. “Score & structure” above the source shows how it is made up and can fix it to a set value.`,
                p2: '“Add part” splits an exercise into a), b), c). Requirement level and competencies appear only on the solution sheet.',
            },
            s4: {
                h: 'Variants and versions',
                p1: 'Variants are equivalent phrasings of the same exercise, e.g. for groups A and B; they are analysed together. Versions record the revisions without changing the analysis of past exams. “Duplicate” creates a separate copy of the group.',
            },
            s5: {
                h: 'Multiple choice',
                p1: 'Tick-box exercises store their options, the correct answers and an optional penalty. The ticks are detected automatically when scans are imported. Several tick-box exercises can be combined into an MC group on the exam page; that only affects the layout.',
            },
            s6: {
                h: 'Images, files and packages',
                p1: 'Attach the files your source includes (no SVG, convert it to PDF first). Add your own packages for all exams under Settings → “LaTeX packages”, or for one exercise under “Packages of this exercise” in the editor.',
            },
            s7: {
                h: 'When compiling fails',
                p1: 'The error message names the exercise and line and, where recognised, the likely cause. “Create prompt for AI chat” and “Create AI prompt” in the editor prepare a prompt for an AI chat of your choice; Examance itself sends nothing. If a PDF looks wrong, use “Report LaTeX layout problem” below the preview.',
            },
            s8: {
                h: 'Sharing and copying exercises',
                p1: '“Share…” makes an exercise group visible to every account of this installation, together with your email address. Under “Shared by others” you copy exercises into your library as your own copy; “Update available” signals changes to the original.',
            },
            s9: {
                h: 'Proposing changes to the original',
                p1: '“Propose to original…” suggests your improvement to the person who shares the exercise. They review it under “Proposals”, can edit it, and accept or reject it; accepting always adds a new version or variant.',
            },
            s10: {
                h: 'Exporting (ZIP)',
                p1: '“Export (ZIP)” on an exercise group and “Export library” download the exercises as readable LaTeX with their files, e.g. for Overleaf. “Import” reads both ZIPs back, also into another Examance installation.',
            },
        },
        examCreation: {
            title: 'Creating an exam',
            summary: 'Header data, exercise selection, grading key and the PDF run.',
            s1: {
                h: 'Header data',
                p1: 'Subject, class, exam type, date and number appear on the cover sheet and are always printed in German. The optional topic only organises the overview and is never printed.',
            },
            s2: {
                h: 'Assembling exercises',
                p1: '“New exam” asks for the header data and opens the exam. There you pick exercises from the library or write your own with “New exercise”; the arrows reorder them. “Insert page break” starts an exercise on a new page.',
                p2: '“Duplicate” creates a new exam with the same exercises and settings, e.g. for a parallel class. Students and results are never copied.',
            },
            s3: {
                h: 'Grading key',
                p1: 'The grading key decides which percentage earns which grade: a preset or your own cutoffs for grades 1 to 6.',
            },
            s4: {
                h: 'Layout options',
                p1: '“Print a name line next to the QR code box” adds a name line to the title page. “Space for extra solutions at the end” fills the last page with a grid area. Logo and LaTeX packages of a single exam are set under “Edit Exam”.',
            },
            s5: {
                h: 'Typeset and print',
                p1: 'The run produces a print-ready PDF with QR codes for exam, variant and student slot. Print the sheets exactly as typeset, without scaling: the QR code has to stay readable, otherwise the scan cannot be assigned automatically later.',
            },
        },
        scanning: {
            title: 'Scanning & assignment',
            summary: 'From the paper stack to an assigned, encrypted sheet.',
            s1: {
                h: 'Importing the stack',
                p1: 'Scan the whole stack into a single PDF on the school copier and upload it here. Examance splits it into submissions along the QR codes and encrypts every page in the browser right away.',
            },
            s2: {
                h: 'Pseudonyms, not names',
                p1: 'The QR code points at a pseudonym, not a name. The link between person and submission is stored separately and restored only after grading.',
            },
            s3: {
                h: 'When assignment fails',
                p1: 'Pages with an unreadable or missing QR code are listed separately. Assign them with the fallback code printed on the sheet.',
            },
            s4: {
                h: 'Verifying MC detection',
                p1: 'Ticked boxes are detected automatically on import. In the MC verification view you confirm or correct the uncertain detections first; every confirmed or corrected question counts as verified. “Spot-check” opens a random confident detection.',
            },
            s5: {
                h: 'Re-running detection',
                p1: '“Re-run MC detection” evaluates all scans again with the current settings. Verified questions and manually entered scores stay unchanged. The detection method is chosen under Settings → MC detection.',
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
                p1: 'Marks and stamps sit on a layer above the scan; the original stays untouched. Click an exercise in the scoring panel to make it the stamp target. Scroll through the pages; Ctrl + mouse wheel or pinching zooms.',
                p2: 'Points are awarded per exercise. Total score and grade follow continuously from the grading key.',
            },
            s3: {
                h: 'Tick-box exercises',
                p1: 'For single and multiple choice, the detected ticks and the penalty are applied automatically. You can review and correct the result before saving.',
            },
            s4: {
                h: 'Classes graded on paper',
                p1: 'Under “Paper & Excel” you enter points without scans directly in a grid, or paste them from Excel (Ctrl + V).',
            },
            s5: {
                h: 'Work in progress',
                p1: 'Save points and annotations before you move on. Leaving the page with unsaved annotations is intercepted — only confirm if you really want to discard them.',
            },
        },
        stats: {
            title: 'Exam analysis',
            summary: 'Grade distribution, borderline cases and export for one exam.',
            s1: {
                h: 'Grade distribution',
                p1: 'Three charts show the grade and percentage distribution, always from the best result on the left to the worst on the right and coloured by grade. The tiles above give average, pass rate, median and standard deviation; the ⓘ explains each figure. SVG, PDF and PNG download a chart.',
            },
            s2: {
                h: 'Borderline cases',
                p1: 'The “Borderline” tile counts close calls: “+” just below the better grade, “−” just above the worse one. The table below lists them; clicking one opens the submission anonymously in grading.',
            },
            s3: {
                h: 'Partially graded submissions',
                p1: 'Submissions where not every exercise has been graded yet are included with their provisional percentage and drawn in a lighter tone.',
            },
            s4: {
                h: 'Export',
                p1: 'The CSV export gives the grades for the school’s grade management. “Export” with “Readable ZIP” bundles graded submissions as PDF, LaTeX source, a summary and the grades. Both contain real names and are unencrypted.',
            },
        },
        analytics: {
            title: 'Cross-exam analytics',
            summary: 'Topic heatmaps, exercise quality and variant fairness across exams.',
            s1: {
                h: 'Across exams',
                p1: 'Analytics combines several exams and shows how results develop over time, across grades and across subjects. The histogram sorts all fully graded submissions by their percentage; colours and bands follow one shared reference key.',
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
            summary: 'Storage strategy, LaTeX compilation, exam logo, language, MC detection and data deletion.',
            s1: {
                h: 'Storage strategy',
                p1: 'Decides where the results are stored: entirely on the server, or in this browser only (hybrid). The setting belongs to your account and applies in all browsers; which options your account may use is decided by the server.',
            },
            s2: {
                h: 'LaTeX compilation',
                p1: 'In the browser (nothing leaves the device, the first run downloads the LaTeX environment) or on the server (faster on weak hardware). Applies per browser. If the first run reports a missing .sty file, retry once the download has finished.',
            },
            s3: {
                h: 'Language and colour scheme',
                p1: 'Interface in German or English; light, dark or following the system; both can also be switched from the navigation bar. The printed exam is always in German.',
            },
            s4: {
                h: 'Logo on the exam',
                p1: 'Under “Exam logo” you upload your own logo (PNG, JPEG or PDF, at most 2 MB), choose “No logo”, or reset to the default. A single exam can override the logo.',
            },
            s5: {
                h: 'Fine-tuning MC detection',
                p1: 'Detection method and thresholds, e.g. for very light or dark scans. Applies only to future detection runs and only in this browser; “Reset to defaults” restores the built-in values.',
            },
            s6: {
                h: 'Improve MC detection (optional)',
                p1: 'When this option is on, the browser sends small anonymised crops of the boxes of every verified tick-box question (no question text, names or ids) to this installation’s server. Off by default, applies only to this browser.',
            },
            s7: {
                h: 'Session and deletion',
                p1: 'The session locks itself after a period of inactivity. Data deletion removes individual student records (GDPR requests); “Delete account” deletes your whole account after confirmation by email. Deletion is final.',
            },
            s8: {
                h: 'Updates and maintenance',
                p1: 'Before an update or maintenance, Examance reminds you twice to save your work; "I\'ve saved my work" tells the administrators. Just keep the tab open: changes that did not get through are sent automatically afterwards.',
            },
        },
        security: {
            title: 'Sign-in & security',
            summary: 'Check and change your factors, change your password, replace your codes.',
            s1: {
                h: 'What this page shows',
                p1: 'For every factor: whether it is set up, when it was last used, and whether it can also open your encrypted data. An authenticator app cannot.',
            },
            s2: {
                h: 'Changing your password',
                p1: 'You change your password here directly; nothing is re-encrypted, and you stay signed in. Other devices are signed out; passkeys and recovery code stay valid.',
            },
            s3: {
                h: 'Backup codes and the recovery code',
                p1: 'Backup codes stand in for the authenticator app, each works once. The recovery code opens your encrypted data if you forget your password; a new one invalidates the old one.',
            },
            s4: {
                h: 'Removing a factor',
                p1: 'A factor can only be removed while two remain afterwards and at least one of them can open your data.',
            },
        },
        accounts: {
            title: 'Accounts & roles',
            summary: 'Requesting an account, approval and features, roles, password resets.',
            s1: {
                h: 'Requesting an account',
                p1: 'Every use needs a server account. With “Request an account” on the sign-in page you confirm your email address and choose a password. With an allowed domain the account is active right away, otherwise it waits for approval by the administrators.',
            },
            s2: {
                h: 'Approval and features',
                p1: 'Your administrator decides what your account may use: results on the server, LaTeX on the server, sharing exercises. Options your account may not use show as “not enabled”.',
            },
            s3: {
                h: 'Two sign-in factors',
                p1: 'You sign in with a passkey on its own, or with two of three factors: password, authenticator app, passkey. Enrol all three where you can, then losing one is merely inconvenient.',
            },
            s4: {
                h: 'Passkeys',
                p1: 'A passkey signs you in with a fingerprint, your face or a device PIN and is enough on its own. Whether it can also open your encrypted data depends on the device; “Enable data access” sets that up.',
            },
            s5: {
                h: 'Resetting a password',
                p1: '“Forgot password” resets it: confirm with a second factor, choose a new password and enter your recovery code once, so your existing data stays readable.',
            },
            s6: {
                h: 'Recovery code',
                p1: 'The code is shown exactly once. Keep it outside the browser. Without it and without your old password, encrypted data stays permanently unreadable, also for the administrators.',
            },
            s7: {
                h: 'Too many failed attempts',
                p1: 'After several wrong passwords the account is locked briefly; the lock ends by itself. If you did not cause it, somebody else is trying to sign in.',
            },
            s8: {
                h: 'Roles',
                p1: 'Teachers work with exams, exercises and results. Administrators manage accounts and the server only and see no exam content. Someone who does both uses two accounts.',
            },
            s9: {
                h: 'For administrators: managing accounts',
                p1: 'In User Management you invite people by email, approve registrations, set always-allowed domains and switch features per account. Only list domains whose mailboxes your institution hands out itself.',
            },
            s10: {
                h: 'For administrators: layout reports',
                p1: 'When a teacher reports a layout problem, the “Layout reports” tab shows the LaTeX code, the PDFs and who reported it. Publish only with consent; “Mark as resolved” notifies the teacher.',
            },
            s11: {
                h: 'For administrators: maintenance mode',
                p1: 'Under User Management → Maintenance you announce maintenance with a lead time and duration. Signed-in teachers are reminded; from the second reminder sign-in is paused; “Start now” cuts the countdown short.',
            },
            s12: {
                h: 'Key copy changed',
                p1: 'If you changed your password, recovery code or passkeys on another device, this browser asks once. Confirm only if you made the change yourself; otherwise cancel, do not sign in and tell your administrator.',
            },
        },
        privacy: {
            title: 'Privacy & security',
            summary: 'What is encrypted, what protects the session, how long data is kept.',
            s1: {
                h: 'Zero knowledge',
                p1: 'Your data key is unlocked in the browser with your password, passkey or recovery code and never transmitted. Student data, scans, annotations and scores reach the server only encrypted (AES-256-GCM).',
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
                p1: 'There is no back door. Lose the password and recovery code and the encrypted content of your account is gone for good — in hybrid mode that includes the results in this browser. Back them up regularly as a .examance archive.',
            },
        },
    },
};
