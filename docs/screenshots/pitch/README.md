# Pitch screenshots

Real captures of the current UI (German, dark theme to match the decks, 1600×1000 at 2×), taken from the local demo instance in [`../../demo-instance/`](../../demo-instance/README.md) with **demo data only**: invented accounts at `gymnasium-example.de`, three synthetic classes, synthetic scans with pseudonymous QR codes. Grading, MC detection and statistics are the app's own results on that data. Regenerate with `docs/demo-instance/setup.sh` (or `capture.mjs` + `assets.py` for single files).

| File | Shows |
|---|---|
| `01-dashboard.jpg` | Exam overview |
| `02-library.jpg` | Exercise library, one exercise with variants Gruppe A/B |
| `03-exercise-editor.jpg`, `03b-mc-editor.jpg` | LaTeX editor with live preview; structured multiple-choice editor |
| `04-exam-builder.jpg`, `04b-exam-setup.jpg` | Picking exercises and variants; compiled exam and solution sheet |
| `05-scan-import.jpg` | Scan import after reading 26 booklets |
| `06-grading.jpg` | Blind grading with stamps |
| `07-mc-review.jpg` | MC detection review of one answer |
| `08-results.jpg`, `08b-paper-entry.jpg` | Grade overview; points of a paper-graded class pasted from Excel |
| `09-analytics.jpg`, `09b-variant-comparison.jpg` | Cross-exam analytics; Gruppe A vs. B comparison |
| `10-settings-storage.jpg`, `11-security.jpg` | Storage mode and LaTeX engine; sign-in factors |
| `12-signin-second-factor.jpg`, `13-storage-choice.jpg` | Mandatory second factor and storage choice at first sign-in |
| `14-admin-accounts.jpg`, `15-admin-approvals.jpg`, `16-admin-domains.jpg` | Admin user management |
| `17-scanned-sheet.jpg`, `18-scanned-sheet-mc.jpg` | Synthetic scanned exam pages |
| `19-shared-library.jpg`, `20-share-confirm.jpg`, `21-proposal-review.jpg` | Exercise sharing: shared tab, mandatory confirmation, reviewing a colleague's proposal |
| `examance-logo.png` | App logo (from `frontend/static/favicon.png`) |

Never use real pupil data or a production account.
