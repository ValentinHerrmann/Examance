# Demo instance

Scripts that rebuild a local Examance instance with **demo data only** and capture the screenshots used in the pitch decks and posters (`docs/pitches/`, `docs/posters/`, `docs/screenshots/pitch/`). The cloud sandboxes are ephemeral, so the instance is kept as code: every run produces the same accounts, exercises, exams, scans and grades (fixed seeds), and the screenshots can be refreshed whenever the UI changes.

## What it creates

| Account | Role | Purpose |
|---|---|---|
| `m.berger@gymnasium-example.de` | teacher, server mode | Main demo teacher: 11 exercises (one with variants *Gruppe A*/*Gruppe B*), 4 exams, all results |
| `s.yilmaz@gymnasium-example.de` | teacher | Colleague who shares 3 exercises and receives a change proposal |
| `n.weber@gymnasium-example.de` | teacher, never signed in | First sign-in screens (second factor, storage choice) |
| `admin@gymnasium-example.de` | admin | User management |
| 4 more teachers, 2 pending registrations | | Populate the admin views with different feature switches |

Passwords and roles are in `data/accounts.json` (demo values, local use only). TOTP secrets are enrolled on first sign-in and kept in `.state/totp.json`; `lib.mjs` computes the codes.

Results: *10b* (26 pupils, Gruppe A) and *10a* (25 pupils, Gruppe B, weaker on that exercise) are scanned and graded on screen; *9c* (24 pupils) was "graded on paper" and pasted from a spreadsheet. Target percentages follow a normal distribution (`data/classes.json`), so every grade from 1 to 5 occurs and the variant comparison shows a real gap. Pupil names exist only in the paper class's spreadsheet; scanned booklets carry pseudonymous `BG:` QR codes. Everything is invented.

## Run

1. Start the dev stack: PostgreSQL with user/database `blindgrade` (`CREATEDB` right), Redis, `backend/.env` from `.env.example` with `http://localhost:4173` in `CORS_ALLOWED_ORIGINS`, `uvicorn app.main:app --port 8000` in `backend/`, and `npx vite dev --port 4173` in `frontend/`. The frontend needs the BusyTeX assets (`node scripts/fetch-busytex.mjs static/core && node scripts/process-large-files.mjs static`), because the exams are compiled in the browser.
2. Python with `pymupdf pillow qrcode numpy` for the scan generator (`DEMO_PYTHON=/path/to/python`).
3. `./setup.sh` (about 40 minutes, mostly scan import and grading). `CHROMIUM_PATH` points Playwright at a browser if its own is not installed.

`./setup.sh --keep` reuses the current database; each seeding step records its progress in `.state/progress.json` and skips what is done. `node capture.mjs grading results` retakes single screenshots; `python assets.py` re-crops them.

## Files

| File | Does |
|---|---|
| `reset.sh`, `accounts.py` | Recreate the database, migrate, create accounts and set admin-side flags |
| `seed-library.mjs` | Exercises, variant, sharing, copy and change proposal (through the UI) |
| `seed-exams.mjs` | Exams; compiles 10a/10b and downloads the blank PDFs |
| `mkscans.py`, `data/answers.json`, `data/classes.json` | Synthetic scans and the grading plan per class |
| `mkpaper.py` | Spreadsheet for the paper-graded class |
| `seed-results.mjs` | Scan import, grading, showcase annotations, Excel paste |
| `capture.mjs`, `assets.py` | Dark-theme screenshots and crops |

Never point these scripts at a real server: `reset.sh` drops the local database.
