# Backup and restore guide (operators)

What the two backups cover, how to check that it works, and what to do in each emergency. Setup and design details: `docs/dev/storage_partitions.md`. Hosting: `docs/hosting.md`.

## What is backed up

There are two backups, fully independent of each other:

1. **Scheduled** (the `backup` service, `COMPOSE_PROFILES=backup`): every night at 00:00 in `BACKUP_TZ` (default `Europe/Berlin`) it writes two restic snapshots to the S3 bucket. A container start or restart never takes one, so the schedule does not drift.
2. **Maintenance backup** (the `maintenance-backup` service, always on): a database dump before every backend update and, if the admin chose it, when a manual maintenance starts (issue #130, `docs/dev/maintenance_mode.md`). Teaching writes are frozen while it runs, so it is exactly the state before the update. It lands in `maintenance-backups/` next to `.env` and, when `BACKUP_RESTIC_REPOSITORY` is set, also as a restic snapshot tagged `maintenance`. A dump contains its own (open) maintenance window; every restore ends open windows after migrating, so the restored app is usable right away. A write that committed in the 5 s grace after the freeze (a long upload) can be missing from that one dump.


| Snapshot tag | Contains | Restore with |
|---|---|---|
| `db` | The whole database: accounts, exams, exercises, students, submissions, scores, annotations, logos, audit log | `./restore-backup.sh db <id>` |
| `blobs` | The scan files in the blob directory (only when scans are stored as files, `BLOB_STORAGE_BACKEND=fs`) | `./restore-backup.sh scans [<id>]` |
| `pre-restore` | The database just before a `db` restore (made by the script) | `./restore-backup.sh db <id>` |
| `maintenance` | The database right before an update or a manual maintenance (also as a local file in `maintenance-backups/`) | `./restore-backup.sh maintenance [latest\|<file>\|<id>]` |

**Not backed up:**
- `.env`. It holds the backup password, so keep `BACKUP_RESTIC_PASSWORD`, the S3 keys and the other secrets in a password manager.
- Results of accounts in *hybrid* mode. They live only in the teacher's browser; the teacher's `.examance` workspace archive (older backups: `.bgproj`) is the backup there.

**Retention.** Scheduled snapshots: the newest per day for 7 days, per week for 4 weeks and per month for 3 months (`BACKUP_KEEP_DAILY_DAYS` / `_WEEKLY_WEEKS` / `_MONTHLY_MONTHS` in `.env`). Maintenance backups: the newest `BACKUP_KEEP_MAINTENANCE` (10) local files and as many `maintenance` snapshots. `pre-restore`: the 10 most recent plus the daily/weekly/monthly ones. Anything older cannot be restored.

## The one thing to understand first: rows and files

A scan in the app consists of **two parts**: a database row (the submission, with student, scores and annotations) and the scan **file** in the blob directory. The app shows a scan only when its row exists.

- **Deleting something in the app** (a submission, a student, "delete all submissions", an exam) removes or marks the **rows**. The scan files stay on disk until the next daily retention run notices that no row needs them and removes them. They remain in the backup either way.
- **Restoring files brings back nothing the app can show** if the rows are gone. Only a **database** restore brings back rows.

`./restore-backup.sh scans` says which case you are in. If it prints *"N file(s) on disk belong to no database row: deleted in the app, not lost"*, the files are fine and the rows are missing.

## Which situation am I in?

| Situation | What is lost | Do this |
|---|---|---|
| A teacher deleted something in the app by mistake | Rows (and later the files) | [A](#a-a-teacher-deleted-something-in-the-app) |
| Scans show an error in the app, or files vanished from pCloud or the disk | Files only; the rows are fine | [B](#b-scan-files-are-missing) |
| The database is broken or empty, or a bad migration or operator mistake happened | Rows of every account | [C](#c-the-database-is-damaged) |
| A restore was a mistake | — | [D](#d-undo-a-database-restore) |
| The whole server is gone | Everything | [E](#e-the-whole-server-is-gone) |
| Something broke right after an update | Rows since the update | [F](#f-an-update-broke-the-data) |

All commands run in the stack directory (`~/examance/prod` or `~/examance/preview`). The script asks for the project name before it changes anything; `--yes` skips that.

```bash
./restore-backup.sh list        # every snapshot, times in UTC
```

**`latest` is often the wrong choice after a loss.** Every container start takes a snapshot right away, so the newest one may already show the damaged state. Pick the newest snapshot from **before** the loss in `list`.

### A. A teacher deleted something in the app

**Results deleted from the server in the last 7 days** (single submissions, or the server copy dropped when the teacher moved results into the browser) come back without you: the teacher clicks "Restore results deleted from the server" in Settings → Storage (`POST /user/restore-server-data`). It lists the exams whose older deleted results the retention run already erased (issue #181). It never brings back a deleted exam or a GDPR erasure.

For anything else there is no per-teacher restore yet; the trash in #125 will cover this. Today the only way back is a **full database restore**, and it rolls back **every account** to the snapshot time.

- **Preview:** usually fine. Run [C](#c-the-database-is-damaged) with a snapshot from before the deletion.
- **Production:** only if losing everyone else's changes since that snapshot is acceptable (e.g. right after the mistake, outside school hours). Otherwise ask the teacher to re-upload the scans.
- Scan files usually still exist on disk. If the daily retention run already removed them, run `./restore-backup.sh scans` after the database restore. It finds every file the restored rows need.

### B. Scan files are missing

The rows exist, but the files are gone: a broken mount, an accident in pCloud, a lost disk.

```bash
./restore-backup.sh scans
```

It compares the files the database needs with the files on disk, searches every `blobs` snapshot from newest to oldest for the missing ones, and copies them back. It never overwrites a file. The output lists each restored file and the snapshot it came from. Files that no snapshot holds are listed as "Still missing".

- Mount down? The script refuses to start ("not a marked blob store"). Fix the mount first, then run `restart backend retention-cron backup`.
- `./restore-backup.sh scans <id>` copies every missing file of one particular snapshot, and reports how many it held, how many were already present and how many it copied.

### C. The database is damaged

```bash
./restore-backup.sh list
./restore-backup.sh db <id>
```

The script does this in order:
1. Stops backend, retention and backup.
2. Saves the current state, as a `pre-restore` snapshot off-site and as `restore-safety/db-before-restore-<time>.sql` on the server.
3. Loads the snapshot.
4. Migrates it to the running release.
5. Starts everything again.

If loading fails, the saved state is put back automatically.

Afterwards:
- Check the app, then run `./restore-backup.sh scans` to fill in any scan files the restored rows need.
- **Delete `restore-safety/`** once you are sure. It holds an **unencrypted** copy of the database.

### D. Undo a database restore

```bash
./restore-backup.sh undo
```

This goes back to the state from just before the last `db` restore, using the newest file in `restore-safety/`. If that file is already deleted, use `./restore-backup.sh db <id>` with the `pre-restore` snapshot from `list`.

### E. The whole server is gone

1. Set up the new server as in `docs/hosting.md` §4. Restore `.env` from the password manager: **the same** `BACKUP_RESTIC_REPOSITORY` and `BACKUP_RESTIC_PASSWORD`, but leave `COMPOSE_PROFILES` empty for now. Otherwise the backup service starts snapshotting the empty new database right away.
2. If scans are stored as files, mount the blob directory and mark it (`init-blob-store`, see `docs/dev/storage_partitions.md`).
3. Deploy. CI writes `docker-compose.deploy.yml` and `restore-backup.sh`. The stack starts with an empty database.
4. Run `./restore-backup.sh list`, `./restore-backup.sh db <id>`, then `./restore-backup.sh scans`.
5. Set `COMPOSE_PROFILES=backup` again and run `up -d`.

Passkeys work again only under the same domain (`WEBAUTHN_RP_ID`), and TOTP only with the same `SECRET_KEY`. Restore both from the password manager.

### F. An update broke the data

```bash
./restore-backup.sh list                   # also lists the local maintenance backups
./restore-backup.sh maintenance latest     # newest local file (or newest `maintenance` snapshot)
```

The restore migrates the loaded database to the release that is running. If the update's own migration caused the damage, roll the backend image back first (`docs/hosting.md` §7), then restore. Like `db`, it saves the current state for `undo` first.

## Check that backups work

Do this once after setup, then every few months:

```bash
COMPOSE="docker compose -p examance-prod -f docker-compose.deploy.yml --env-file .env"
$COMPOSE logs --tail 50 backup        # "backup service ready", after midnight "db snapshot done", "blob snapshot done", no "failed"
$COMPOSE logs --tail 20 maintenance-backup   # "maintenance backup ... done" after each update
./restore-backup.sh list              # recent db and blobs snapshots
$COMPOSE exec backup sh -c 'psql -d postgres -c "CREATE DATABASE restore_test" && restic dump latest --tag db examance.sql | psql -q -d restore_test && psql -d restore_test -Atc "select count(*) from exams"; psql -d postgres -c "DROP DATABASE restore_test"'
```

"blob snapshot skipped" in the log means the backup container cannot see the marked blob directory, usually because the mount came up after the container started. Run `restart backup`.

## Privacy

- **Backups are encrypted** before upload. The restic password is the only key.
- **Erased data survives in backups** until the last snapshot holding it expires, at most about `BACKUP_KEEP_MONTHLY_MONTHS` months.
- **Restores bring erased data back.** Restoring a snapshot brings back data that was erased in the meantime, including data erased on request. After a database restore, re-run any erasure requests made after the snapshot time. The audit log records `DELETE` actions, but only with hashed ids.
- **Maintenance backups** in `maintenance-backups/` are unencrypted dumps (mode 600, like `restore-safety/`); erased data survives in them until the newest `BACKUP_KEEP_MAINTENANCE` updates have pushed them out, and in the `maintenance` snapshots as long.
- `restore-safety/` files are unencrypted. Delete them after the restore.
