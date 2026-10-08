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
        storageServer: 'Exams, exercises and results live on the server, but encrypted: the key stays in the browser, so the server cannot read the contents. Only the LaTeX source of exercises and exams and the total score are unencrypted.',
        storageHybrid: 'Exercises and exams live on the server (useful for a shared department catalogue). Student data, scans and scores stay in this browser only, encrypted, and are not visible on other devices.',
        latexLocal: 'The exam is typeset in the browser (WebAssembly XeLaTeX). The LaTeX source never leaves the device, but the first run takes longer.',
        latexServer: 'The server typesets the exam. Faster on low-spec hardware, but the LaTeX source is transmitted.',
        variantKey: 'Variants are different phrasings of the same exercise (group A/B/C). They share grading and statistics while making copying harder.',
        mcPenalty: 'Points deducted for a wrongly ticked option. 0 means no negative marking. An exercise total never drops below zero.',
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
                h: 'Back up your workspace and share results',
                p1: 'The workspace menu creates a password-protected .bgproj archive (Argon2id + AES-GCM) with exams, student data, scans, annotations and scores. It is the main backup for results that live only in this browser in hybrid mode, and the archive can also be imported into a different account. Every exam carries its logo, so it keeps the same header after import. "Share results (without exercise texts)" exports the same but without LaTeX code and resource files; exercise names, points and MC answer keys are kept. Whoever imports such an archive can grade and analyse the exams; they carry a "Results only" notice, and compiling, editing and building MC answer-sheet templates are disabled for those exercises. They do not appear in the exercise library. An exercise already available to you on the server is linked instead of copied. After every export and import a report shows what was included or imported, what was deliberately left out, and which linked exercises were not available. Pass the archive and its password on separately, because it contains student data.',
            },
        },
        storageModes: {
            title: 'Storage & encryption',
            summary: 'Where your data lives — entirely on the server, or with results only in the browser.',
            s1: {
                h: 'The two storage locations',
                l1: 'All on the server: exams, exercises and results (student data, submissions with scans, scores) live on the server and are available in every browser of your account. They are encrypted client-side with AES-256-GCM; the server stores only ciphertext and cannot read it. The LaTeX source of exercises and exams and the total score stay unencrypted.',
                l2: 'Hybrid: exercises and exams live on the server. Student data, submissions with scans and scores live only in the browser where they were recorded, encrypted in its local database. They are not visible on other devices, so back them up with a .bgproj archive.',
                l3: 'The storage location belongs to your account, not to the browser: you choose it in a dialog the first time you sign in (there is no default), and it then applies in all browsers of your account. A purely local mode without an account no longer exists.',
            },
            s2: {
                h: 'What is encrypted',
                p1: 'The contents are encrypted: student data, names, scans, annotations and scores. Only technical linking fields such as ids and ordering stay unencrypted, along with the LaTeX source of exercises and exams and the total score.',
                p2: 'The key is derived from your password. Without the password and recovery code the encrypted data cannot be recovered — not even by whoever runs the server. In hybrid mode this also applies to the results that live only in this browser.',
            },
            s3: {
                h: 'Changing storage location',
                p1: 'You change the storage location in Settings. The switch moves the results directly, exam by exam, from the server to the browser or the other way round; Examance checks that every record arrived. Only then does your account’s storage location change, and the page reloads. No export and re-import is needed for this; you can create a .bgproj backup beforehand if you like.',
                p2: 'Afterwards Examance asks each time whether to keep or delete the old copy. When switching to "Hybrid", the copy on the server is marked for deletion (with a 7-day grace period); when switching to "All on the server", the local copy in this browser is cleared. Changes not yet sent must be sent first ("Send now"), otherwise the switch is refused. Other open tabs are blocked while it runs and reload afterwards.',
                p3: 'If a browser in "All on the server" mode still holds local results, for example from earlier hybrid use, a notice offers to upload them to the server. In hybrid mode, a browser without results shows a notice: the results live only in the browser where they were recorded.',
                p4: 'A browser’s storage always belongs to exactly one account on one server: data belonging to a different account is not opened; a notice explains how to sign in with the matching credentials or reset the storage. Browsers holding data from the former purely local mode (without an account) show a notice instead that this data can no longer be opened. You can delete it and carry on; it is not migrated.',
            },
        },
        exercises: {
            title: 'Exercise library',
            summary: 'Create, tag and maintain exercises, with variants and versions, and share them with others.',
            s1: {
                h: 'Collect instead of copy',
                p1: 'Exercises live in a shared library, tagged by grade, subject and topic. Each one is a LaTeX fragment with a live preview; its score is read from the source automatically.',
                p2: 'Use the filters at the top to narrow the library by grade, subject and topic and reuse an exercise in a new exam.',
                p3: 'Expand an entry to see, per variant, which exams use the exercise (click to open the exam). “Preview” shows the last compiled PDF; if there is none yet, Examance asks whether to compile it now.',
            },
            s2: {
                h: 'Variants and versions',
                p1: 'Variants are equivalent phrasings of the same exercise, e.g. for groups A and B. They are analysed together but make copying harder.',
                p2: 'Versions record the revision history: a reworked exercise replaces the old one without invalidating the analysis of past exams.',
            },
            s3: {
                h: 'Multiple choice',
                p1: 'An exercise can be free text, single choice or multiple choice. Tick-box exercises store their options, the correct answers and an optional penalty. Up to 26 options per question; “Answer option columns” sets how many columns (1–10) they are printed in.',
                p2: 'Several tick-box exercises can be combined into an MC group — already while creating the exam (“MC Groups” tab) or later on the exam page. An exam can hold any number of groups of any size; each question belongs to at most one group. That is layout information for the printout only — grading and statistics stay strictly per question.',
            },
            s4: {
                h: 'Images and files',
                p1: 'You can attach files that the LaTeX source references, e.g. figures via \\includegraphics. SVG is not supported — convert it to PDF first.',
                p2: 'A missing graphic does not abort the run: the exam is still typeset, but the missing file is reported. Check the preview before printing.',
            },
            s5: {
                h: 'Sharing and copying exercises',
                p1: '“Share…” makes an exercise group with all its current variants and files visible to every account of this installation, together with your email address. Others can view and copy it but not change it. Only share exercises without personal data of pupils, and only what you are allowed to pass on.',
                p2: 'Under “Shared by others” you copy an exercise into your library. You get your own copy to edit freely and use in exams; changes or deletion by the person who shared it never affect your exams.',
                p3: 'When the source changes, the copy shows “Update available”. “Update…” shows the differences and takes them over as a new version; your previous version and the exams that use it stay unchanged. If the source is no longer shared, your copy remains. Whether your account may share is set by the administrators.',
                p4: 'You can also share an exercise right in the editor (“Share with all accounts”, with the same confirmation as in the sharing dialog), or share or stop sharing all at once from the “Sharing” menu. “Pause sharing” hides everything you share for a while without forgetting your choices. Exercises copied from others are never shared as your own. When updating, you choose which variants to take over and can edit the result right in the dialog.',
            },
            s6: {
                h: 'Proposing changes to the original',
                p1: 'If you improved your copy or added a variant, “Propose to original…” suggests it to the person who shares the exercise. Changed variants are proposed as a new version, added ones as a new variant. Your email address is shown to them.',
                p2: 'They see proposals under “Proposals” and get a short email notice without content. They compare the proposal with their current version, can edit it, and accept or reject it. Accepting always adds a new version or variant; existing versions and exams stay unchanged. A PDF preview is available only after accepting.',
                p3: 'After the decision the proposal’s content is deleted, the entry itself after 30 days; open proposals after 180 days. You can withdraw an open proposal at any time. Accepted changes reach your copy through “Update…”. If your proposal was accepted unchanged, your copy is automatically back in sync with the original; only an edited acceptance shows “Update available”. Exercises with an open proposal carry a tag in the library that leads straight to the proposals; from there, “Open in library” opens the exercise.',
            },
        },
        examCreation: {
            title: 'Creating an exam',
            summary: 'Header data, exercise selection, grading key and the PDF run.',
            s1: {
                h: 'Header data',
                p1: 'Subject, class, exam type, date and number appear on the cover sheet. These are exam content and are therefore always printed in German, whatever language the interface is in.',
                p2: 'The optional topic (for example “Recursion”) organises your exams in the overview, where you can filter and search by it, and is never printed on the exam.',
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
                p1: 'The run produces a print-ready PDF with QR codes — one per exam, variant and student slot. If you typeset in the browser, it happens entirely on the device.',
                p2: 'Print the sheets exactly as typeset. The QR code has to stay readable, otherwise the scan cannot be assigned automatically later.',
                p3: 'In the exam overview, “Preview” in an expanded entry opens the last compiled PDF. If there is none, you are asked and the exam is compiled and shown right in the window. The preview is kept only until the page is reloaded.',
            },
        },
        scanning: {
            title: 'Scanning & assignment',
            summary: 'From the paper stack to an assigned, encrypted sheet.',
            s1: {
                h: 'Importing the stack',
                p1: 'Scan the whole stack into a single PDF on the school copier and upload it here. Examance splits it into individual submissions along the QR codes.',
                p2: 'Every page is encrypted in the browser immediately. In hybrid mode the scan never leaves the device, and in all-server mode it is transferred only as ciphertext — apart from the optionally donated, anonymised crops of individual tick boxes.',
            },
            s2: {
                h: 'Pseudonyms, not names',
                p1: 'The QR code points at a pseudonym, not a name. The link between person and submission is stored separately and restored only after grading.',
            },
            s3: {
                h: 'When assignment fails',
                p1: 'Unreadable or missing QR codes end up in the verification view. There you can assign pages to the right submission by hand, or enter the fallback code printed on the sheet.',
            },
            s4: {
                h: 'Verifying and re-running MC detection',
                p1: 'Ticked boxes are detected automatically when scans are imported. In the MC verification view you confirm or correct uncertain detections; every confirmed or corrected question counts as verified.',
                p2: '"Re-run MC detection" re-evaluates all scans with the current settings. Unverified questions take the new result; for verified questions your answer and score always stay unchanged and only their detection is recomputed for comparison. Manually entered scores are not touched. A dialog first shows what will change and whether the settings differ from the last run; the "Detection settings" panel compares the latest run\'s values with the ones currently in effect.',
                p3: 'Besides the fill level, detection also checks the shape of a mark: an evenly filled box counts as withdrawn, and a mark reaching far beyond the box or a very faint mark is flagged as uncertain. The reason is shown next to the answer option in the verification view. With method v2, shape analysis can be switched off in Settings. Under Settings → MC detection you choose the detection method: v4 (default, stroke shape) or v2 (older method, fill level). The other one always runs alongside; the "Detection settings" panel of the verification view shows how many of your verified boxes each method would have read correctly. Unsure boxes keep their yellow frame until the question is verified.',
                p4: 'Until verified, an uncertain box counts provisionally as whichever outcome its measurements are closer to — ticked or not ticked; the verification view shows "Provisionally counted as ticked / not ticked" for it. The "🎲 Check a sample" button opens a random, not-yet-verified but confident detection, so you can spot-check unremarkable questions too.',
                p5: 'The verification view lists the answer options as printed on the sheet and scores them with the exercise\'s current answer key. If the number of boxes on the scan does not match the exercise\'s options (it was changed after printing), the view says so and does not score the question; award the points in the canvas workspace instead.',
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
                p1: 'Correction marks are drawn on a layer above the scan. The original stays untouched and can be shown without annotations at any time. All pages of a submission are stacked: scroll through them with the mouse wheel or scrollbar, or with two fingers on touch devices (one finger draws). Ctrl + mouse wheel or pinching zooms.',
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
                h: 'Grade distribution',
                p1: 'The grade distribution always shows the full 1 to 6 scale, even where a grade does not occur at all — a grade nobody reached is information too. The percentage distribution likewise shows every percentage range, in equal steps of at most 5 %. The step follows the grading scale: it is chosen so that every grade boundary falls on a bar boundary and no bar mixes two grades — 2.5 % for the linear 50 % scale with boundaries such as 62.5 %. All charts read from the best result on the left to the worst on the right and colour their bars by grade (1 dark green to 6 dark red); the third chart puts the percentage bars in front of the grade bars and captions each grade bar on top with its grade, label, count and share; a strip above it marks the average (●) and median (◇) and shows average ± standard deviation as a labelled bracket; a faint curve behind the bars shows the normal distribution with these values for comparison. Fixed labels (grades, grade names, percentage ranges) are grey; values that change as grading continues (counts, shares) are white. Percentage ranges always name the upper bound first (e.g. 100–85 %), matching the axis that starts at 100 % on the left. Where bars are too narrow to label each one, a label stays at every grade boundary and the tooltip shows the rest. The SVG, PDF and PNG buttons download each chart with a transparent background and dark text for light pages: SVG and PDF as vector graphics, PNG at 8K resolution (7680 × 4320). In the grade distribution, borderline cases are set off in a darker shade: “+” at the top of the bar (just below the better grade), “−” at its foot (just above the worse grade); the height of each section shows the count.',
                p2: 'The figures above them give the class average grade, the pass rate, the average score, and the mean, median and standard deviation of the percentages; the ⓘ on each tile explains the figure briefly. The average grade, average points, average percentage and median are tinted in the colour of the grade they correspond to, like the bars in the charts. The “Borderline” tile counts the close calls (+ / −), and a table below the merged chart lists every submission close to a grade boundary: plus means at most 0.75 points short of the next better grade, minus at most 0.5 points above the lower boundary of its own grade (exactly on the boundary counts as minus). Each row gives the points achieved, the boundary in points and the distance to it; clicking an entry opens it in grading, as the anonymous student with the same number shown there. For partially graded submissions, the points of the exercises graded so far count.',
            },
            s2: {
                h: 'Partially graded submissions',
                p1: 'Submissions where not every exercise has been graded yet are included with their provisional percentage — computed over the exercises graded so far. Those portions are drawn in a lighter tone, so a half-corrected class does not read as a finished result.',
            },
            s3: {
                h: 'Export',
                p1: 'Results can be exported as CSV, e.g. for the school’s grade management system. The file contains pseudonym, fallback code, name, score, max points, percentage and grade. The export contains real names — handle the file accordingly.',
            },
        },
        analytics: {
            title: 'Cross-exam analytics',
            summary: 'Topic heatmaps, exercise quality and variant fairness across exams.',
            s1: {
                h: 'Across exams',
                p1: 'The analytics view combines several exams and shows how results develop over time, across grades and across subjects. The overall score histogram sorts all fully graded submissions into 10 % ranges by the share of their exam’s maximum points they reached.',
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
                p1: 'Decides where the results (student data, submissions, scores) are stored: entirely on the server, or in this browser only (hybrid). The setting belongs to your account and applies in all browsers. You must choose when you first sign in; there is no default. Which options your account may use is decided by the server.',
            },
            s2: {
                h: 'LaTeX compilation',
                p1: 'Independently of that, you can choose where the exam is typeset: in the browser (nothing leaves the device, but the first run is slower) or on the server (faster on weak hardware). This choice applies per browser; typesetting on the server is only available if your account allows it.',
                p2: 'The first run in the browser downloads the LaTeX environment. If it fails with a message about a missing .sty file, retry once the download has finished.',
            },
            s3: {
                h: 'Language',
                p1: 'The interface is available in German and English, switchable here or from the navigation bar at the top. The printed exam is unaffected — it is always in German.',
                p2: 'The colour scheme (light, dark or follow the system) can be chosen in the navigation bar and here in Settings. It only affects the interface, not the printed exam.',
            },
            s4: {
                h: 'Session and deletion',
                p1: 'The session locks itself after a period of inactivity; afterwards the content is reachable only with the password again.',
                p2: 'Data deletion removes individual student records (GDPR access and erasure requests) or the entire workspace. Deletion is final and cannot be undone.',
                p3: 'Under “Delete account” you can delete your own account. You receive an email with a link; the account is deleted only when you open it and confirm. Everything stored with it on the server goes (exams, results, sign-in factors), and the browser you confirm in is cleared (other browsers keep their local copy, which can no longer be read without the account). Your exercises can optionally stay on the server without your name, so they can be shared later. Admins can also delete other accounts in account management, with the same option.',
            },
            s5: {
                h: 'Fine-tuning MC detection',
                p1: 'The thresholds for detecting ticked boxes can be adjusted, e.g. when a scanner produces very light or dark scans. Settings apply only to future detection runs; results that were already detected or verified do not change. Every run records the values it used.',
                p2: 'The settings are stored in this browser only and are not synced to other devices. "Reset to defaults" restores the built-in values.',
            },
            s6: {
                h: 'Improve MC detection (optional)',
                p1: 'When this option is on and you are signed in to a server account, the browser collects a small crop per box (80×48 pixels, grayscale, no question text) for every verified or corrected tick-box question, along with the confirmed label, the original detection and a few numeric features, and sends them in batches to this installation\'s server. Names, pseudonyms, exam/submission/question ids and timestamps are never sent; each box only carries a random id, so a later correction replaces the earlier label. Signing in only guards against abuse — the account is not stored with the crops.',
                p2: 'The goal is a shared, better classifier so new installations get good detection from the start. The setting is off by default, applies only to this browser, and can be switched off again at any time.',
            },
            s7: {
                h: 'Logo on the exam',
                p1: 'A logo is printed at the top left of the first page of every exam; the MTG logo is the default. Under “Exam logo” you can upload your own (PNG, JPEG or PDF, at most 2 MB), choose “No logo”, or reset to the default. Without a logo the spot stays empty; the page layout and the position of the answer boxes do not change. In the exam overview, every expanded exam shows which logo it prints.',
                p2: 'An exam’s details can override the logo: the logo from the settings, no logo, or an own logo for this exam only. Like the exercises, the logo is stored on the server.',
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
            summary: 'Requesting an account, approval and features, roles, password resets.',
            s1: {
                h: 'Do you need an account?',
                p1: 'Yes. Every use of Examance needs a server account; the former local mode with a passphrase and no account no longer exists. Which storage locations and features your account may use is decided by your administrator.',
            },
            s2: {
                h: 'Roles',
                p1: 'Teachers work with exams, exercises and results and see only their own. Administrators manage accounts and the server only: they cannot create or open exams or exercises, and the app shows them just user management, settings and help. Someone who administers and also teaches uses two accounts.',
                p2: 'Administrators get no access to anyone’s exam content either, because it is encrypted client-side.',
            },
            s6: {
                h: 'Two sign-in factors',
                p1: 'You sign in with a passkey on its own, or with two of three factors: password, authenticator app, passkey. Password and authenticator app never suffice alone — a guessed password gets nowhere.',
                p2: 'Enrol all three where you can — then losing one is merely inconvenient. With exactly two, losing one means only an administrator can get you back in, and only to the account, not to the encrypted data. Backup codes stand in for the authenticator app and work once each.',
            },
            s7: {
                h: 'Passkeys',
                p1: 'A passkey signs you in with a fingerprint, your face or a device PIN — no password. Because the device checks your fingerprint, face or PIN, it is enough on its own. After signing in with a password, the passkey prompt opens automatically as the second factor; cancel it to use the authenticator app instead.',
                p2: 'Whether a passkey can also open your encrypted data depends on the device. Settings shows this per passkey; “Enable data access” sets it up there without the password. Passkeys stored in Bitwarden currently cannot. Where it cannot, your password and recovery code stay responsible for that.',
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
            s8: {
                h: 'Requesting an account',
                p1: 'With "Request an account" on the sign-in page you enter your email address and receive a confirmation link. Through that link you choose your password; only then is the account created. The page deliberately does not reveal whether an address already has an account.',
                p2: 'If your address belongs to a domain your administrator has allowed, the account is active right away. Otherwise it waits for approval; until then signing in only reports "awaiting approval", and you get an email once it is approved. You set up your second sign-in factor on your first sign-in.',
            },
            s9: {
                h: 'Approval and features',
                p1: 'Your administrator approves every account and decides what it may use: student data and results on the server (otherwise they stay in this browser) and LaTeX compilation on the server (otherwise the browser compiles). Exams and exercises always live on the server. Options your account may not use show as "not enabled".',
                p2: 'If "student data on the server" is turned off later, the app asks you, the next time it opens, to move your results into the browser. Nothing is lost.',
            },
            s10: {
                h: 'For administrators: invitations and allowed domains',
                p1: 'In User Management you invite people by email; the account is approved right away, and the person chooses their password through the link. Pending registrations are approved or rejected there; rejecting deletes the registration.',
                p2: 'Registrations from "always-allowed" domains are approved automatically once the address is confirmed. Only list domains whose mailboxes your institution hands out itself, never public providers.',
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
                p1: 'There is no back door and no recovery by the server operators. Lose the password and recovery code and the encrypted content of your account is gone for good — in hybrid mode that includes the results that live only in this browser. Back these up regularly as a .bgproj archive.',
            },
        },
    },
};
