# User-guide screenshots

Detail captures for the user guide (`docs/user/`, `docs/de/user/`), in the same style as [`../pitch/`](../pitch/README.md): German UI, dark theme, 1600×1000 at 2×, **demo data only**, from the local demo instance in [`../../demo-instance/`](../../demo-instance/README.md). Regenerate with `node capture.mjs guide-<name> …` and `python assets.py guide` there.

| File | Shows | Used in |
|---|---|---|
| `exercise-score.jpg` | "Punkte & Aufbau" dialog | `exercises#score` |
| `exercise-compile-error.jpg` | Compile error with its likely cause, AI-prompt and log buttons | `exercises#compile-errors` |
| `exercise-ai-prompt.jpg` | "KI-Prompt erstellen" dialog | `exercises#ai-prompts` |
| `exam-exercises.jpg` | Exam page: MC group, page breaks, extra solution space | `exams#page-breaks` |
| `exam-export.jpg` | Export dialog of an exam | `exams#export` |
| `exam-mc-hint.jpg` | MC correction line, cropped from the compiled exam PDF | `exams#mc-hint` |
| `grading-parts.jpg` | Grading view: part rows, filled score boxes | `grading#parts` |
| `settings-restore.jpg` | Restoring results deleted from the server | `settings#restore` |
| `workspace-backup.jpg` | Workspace backup dialog | `backup#workspace-backup` |
| `help-dialog.jpg` | In-app help with links into the guide | `index#help-and-docs` |
| `settings-storage.jpg` | Storage location in the settings | `settings` |
| `settings-mc-detection.jpg` | MC detection fine-tuning | `settings#mc-detection` |
| `settings-latex-packages.jpg` | Account-wide LaTeX packages | `settings#packages` |
| `settings-security.jpg` | Sign-in factors in the settings | `security#security-page` |
| `results-borderline.jpg` | Borderline table and grade distribution | `results#borderline` |
| `admin-maintenance.jpg` | Admin maintenance tab | `admin#maintenance` |

Never use real pupil data or a production account.
