# Storage partitions (issue #114)

Server data is split into partitions. Each one can have its own mount point, so a host can keep large, rarely-read data off the SSD without moving latency-sensitive data with it.

| Partition | Holds | Where | Chosen for |
|---|---|---|---|
| `db` | Every row: accounts, exams, exercises, scores, annotations, resources, logos, audit | Postgres volume `pg_data` (server SSD) | Low latency, transactions |
| `blobs` | Scan ciphertexts (`scan_submissions`) | `BLOB_STORAGE_DIR`, a local dir or an rclone mount (pCloud, …) | Large (up to ~50 MB each), written once, read on demand, already client-side encrypted |
| `cache` | Tectonic cache, per-compile temp dirs | `tectonic_cache` volume, `/tmp` | Disposable, public files only |
| `backups` | Daily restic snapshots of the DB and of `blobs` | restic repository on S3 (IONOS, …) | Off-site, encrypted, deduplicated, bounded lifetime |

Without configuration (`BLOB_STORAGE_BACKEND=db`, no `BLOB_STORAGE_DIR`), everything stays in Postgres, as it did before.

## Scans

- **Columns.** A scan lives in exactly one of two columns: `scan_path`, a ref relative to `BLOB_STORAGE_DIR`, or `scan_ciphertext`, the in-DB copy. Code reads and writes them only through `app/services/scan_storage.py`. `scan_ciphertext` is `deferred`, so listings never load its bytes; `scan_in_db` answers "is there a DB copy?" in SQL. If both columns are set (a pre-#114 backend rewrote a moved row during a deploy), the DB copy is the newer one and wins.
- **File names.** The layout is `scans/<exam_id>/<submission_id>-<random>.bin`. Every write creates a fresh file: a temp file plus fsync, then `os.replace`, then a size check. A committed row therefore never points at a half-written file.
- **Session hooks.** Hooks in `blob_store.py` delete replaced files only after the commit and delete newly written files on rollback. Deletes that cascade in the database (account deletion, erasing a student identity) drop the exam's directory after the commit. The daily retention run then sweeps every file that no row references and that is older than one hour, which catches crash leftovers and anything the hooks missed. Retention therefore erases scan files on the same schedule as their rows.
- **Mount guard.** `cli.py init-blob-store` writes `.examance-blobstore` into the directory. It contains the stack's `FRONTEND_URL`.
  - Without the sentinel, every scan read and write fails with `503 ERR_BLOB_STORE_UNAVAILABLE`, the sweep and the blob backup are skipped, and `/api/health` reports `"blob_store": "unavailable"`. A dropped rclone mount therefore shows up as an empty mountpoint that is refused, never one that gets written to.
  - With a sentinel whose `FRONTEND_URL` belongs to another stack, the same failure applies. This keeps preview and production from sweeping each other's files.
- **Ciphertext only.** The server only ever handles scan ciphertext: AES-256-GCM, encrypted in the browser. The external store sees the same opaque bytes Postgres did, and in `hybrid` mode no scan reaches the server at all.

## Moving scans

- **Moving to files.** Set `BLOB_STORAGE_BACKEND=fs`; migration `0038_scan_blob_storage` moves every DB copy into files. For each row it writes the file, re-reads it and compares SHA-256, then runs `UPDATE … SET scan_path, scan_ciphertext = NULL WHERE scan_ciphertext = <the copied bytes>`.
  - Each row commits on its own (`autocommit_block`). An interrupted migration keeps its progress, and the next `alembic upgrade head` resumes.
  - Deploy time grows with the scan volume.
  - During the move, a still-running old backend shows moved scans as missing. This is a display issue only, and it ends when the new backend starts.
- **Switching later.** `cli.py move-blobs --to fs|db` uses the same code and verification. Set `BLOB_STORAGE_BACKEND` to the target first.
- **Back to the DB.** `move-blobs --to db`, or an Alembic downgrade below 0038, copies files back and leaves them for the sweep. To stop using the partition, keep `BLOB_STORAGE_DIR` set until one retention run has emptied it.
- **Exercise resources later.** Use a new `kind` (`resources`) and a resource equivalent of `scan_storage`/`blob_migration`. `blob_store` is not tied to scans.

## Setup with rclone (example: pCloud)

On the host, per stack, with a directory of its own:

```bash
# systemd unit, ordered before docker.service
rclone mount pcloud:examance-prod /srv/examance-prod-blobs \
  --vfs-cache-mode writes --allow-other --uid 10001 --gid 10001 --umask 077
```

The backend runs as uid 10001. A plain host directory (no rclone) therefore needs `chown 10001:10001`; for an rclone mount, the `--uid/--gid` flags above handle it.

1. Put `BLOB_STORAGE_HOST_DIR=/srv/examance-prod-blobs`, `BLOB_STORAGE_DIR=/data/blobs` and `BLOB_STORAGE_BACKEND=fs` in the stack's `.env`.
2. Mark the directory. The usual way is `docker compose … run --rm backend python -m app.cli init-blob-store`. Before the first deploy of a release containing 0038, that command does not exist in the running image yet. In that case write the sentinel by hand: `printf '{"identity": "%s"}' "<FRONTEND_URL without trailing slash>" > /srv/examance-prod-blobs/.examance-blobstore`.
3. Deploy. The migration moves the existing scans.

On a stack that already runs 0038, do steps 1 and 2, then restart and run `cli.py move-blobs --to fs`.

After the mount comes back, restart the backend. A container only sees a mount that existed when it started, unless the bind uses `rslave` propagation.

## Backups

The `backup` service in `deploy/docker-compose.deploy.yml` uses [restic](https://restic.net) and is opt-in: `COMPOSE_PROFILES=backup` in `.env` starts it on every deploy. It runs at 00:00 in `BACKUP_TZ` only, never on container start. Independent of it, the `maintenance-backup` service dumps the database before every update (`docs/dev/maintenance_mode.md`).

- **Repository.** `BACKUP_RESTIC_REPOSITORY` (e.g. `s3:https://s3.eu-central-3.ionoscloud.com/<bucket>/examance-prod`) with `BACKUP_S3_ACCESS_KEY_ID` / `BACKUP_S3_SECRET_ACCESS_KEY` / `BACKUP_S3_REGION`. restic encrypts (AES-256) and compresses on the server before upload, so the provider sees only ciphertext, which matters because the dump holds plaintext tables (exercises, logos, e-mail addresses, audit entries). `BACKUP_RESTIC_PASSWORD` is the only way to decrypt: keep it in a password manager. Use one prefix and one password per stack. The service runs `restic init` on first start.
- **Nightly run** (00:00, `BACKUP_TZ`).
  1. Snapshot tagged `db`: `pg_dump --no-owner` as plain SQL, streamed via `--stdin-from-command`, so a failing dump fails the snapshot. Plain on purpose: an already compressed dump would never deduplicate.
  2. Snapshot tagged `blobs` of `/data/blobs`. It runs only if the sentinel exists; otherwise the log says "blob snapshot skipped".
  3. `restic forget --group-by tags --tag db --tag blobs` keeps the newest per day for `BACKUP_KEEP_DAILY_DAYS` (7) days, the newest per week for `BACKUP_KEEP_WEEKLY_WEEKS` (4) and the newest per month for `BACKUP_KEEP_MONTHLY_MONTHS` (3); `pre-restore` additionally keeps its 10 most recent. `maintenance` snapshots are pruned by the `maintenance-backup` service. Then `restic prune`.
  4. `restic check` verifies the repository structure.
- **Snapshots are complete.** restic stores content-addressed chunks; every snapshot references all chunks it needs, old or new. `forget` deletes snapshots, and `prune` deletes only chunks no remaining snapshot references, so every kept snapshot restores on its own. Storage is therefore about one copy of the DB plus its daily changes, one copy of the scans, and the scans deleted while an older snapshot still holds them.
- **Fixed hostname.** The container's `hostname` is `examance-backup`. restic groups snapshots by host by default, and a random name per deploy would keep every old snapshot forever.
- **Erasure.** An erased record survives in backups until the last snapshot holding it is forgotten: at most about `BACKUP_KEEP_MONTHLY_MONTHS` months (3 by default), plus the in-app grace period. This bound is documented in the Art. 30 record.
- **Restore.** The deploy workflows put `restore-backup.sh` next to `.env` in each stack's directory (source: `deploy/restore-backup.sh`). Run it there as the deploy user:
  ```bash
  ./restore-backup.sh list                 # snapshots (UTC); pick the newest one from BEFORE the loss
  ./restore-backup.sh db <id|latest>       # replace the whole database with that snapshot
  ./restore-backup.sh undo                 # back to the state just before the last db restore
  ./restore-backup.sh scans                # copy back the scan files database rows need but are missing
  ./restore-backup.sh scans <id|latest>    # copy back every missing scan file of one snapshot
  ./restore-backup.sh maintenance [latest|<file>|<id>]  # the database as it was before an update
  ```
  Operator guide with the situations and steps: `docs/backup_and_restore.md`.
  - `db` stops backend, retention-cron and backup. It saves the current state as a restic snapshot tagged `pre-restore` (off-site, listed, restorable with `db <id>`, never picked by `latest`) and as `restore-safety/db-before-restore-<time>.sql` for `undo`. It then loads the snapshot, migrates to the running release and starts the stack. If loading fails, the saved state is put back at once.
  - A database restore rolls back *everything* since the snapshot, for every account. Teachers can read restored data again because their key envelopes are part of the same snapshot.
  - `scans` without an id reads every `scan_path` from the database, searches all `blobs` snapshots newest first for the missing ones (files are immutable and uniquely named, so any snapshot holding one is right) and reports per file. With an id it copies that snapshot's missing files and reports held/present/copied. It never overwrites or deletes a file. Files no row references are removed by the next retention run.
  - `scans` cannot undo a deletion in the app: that removes the database rows, while the files usually stay on disk. The script detects this and points to `db`.
  - `restore-safety/` holds plaintext dumps: delete them once the restore is confirmed.
  - Every container start takes a snapshot at once, so after a data loss `latest` may already show the damaged state. `--keep-last 10` makes sure the earlier snapshots of the same day survive.
- **Moving from the earlier rclone backup.** Point `BACKUP_RESTIC_REPOSITORY` at a new prefix, and delete the old rclone prefix once the first snapshots exist.
