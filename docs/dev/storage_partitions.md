# Storage partitions (issue #114)

Server data is split into partitions. Each one can have its own mount point, so a host can keep large, rarely-read data off the SSD without moving latency-sensitive data with it.

| Partition | Holds | Where | Chosen for |
|---|---|---|---|
| `db` | Every row: accounts, exams, exercises, scores, annotations, resources, logos, audit | Postgres volume `pg_data` (server SSD) | Low latency, transactions |
| `blobs` | Scan ciphertexts (`scan_submissions`) | `BLOB_STORAGE_DIR`, a local dir or an rclone mount (pCloud, …) | Large (up to ~50 MB each), written once, read on demand, already client-side encrypted |
| `cache` | Tectonic cache, per-compile temp dirs | `tectonic_cache` volume, `/tmp` | Disposable, public files only |
| `backups` | Daily `pg_dump` and a copy of `blobs` | rclone *crypt* remote (IONOS S3, …) | Off-site, bounded lifetime |

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

The `backup` service in `deploy/docker-compose.deploy.yml` is opt-in: start it with `--profile backup`.

- **Remote.** `BACKUP_REMOTE` names an rclone **crypt** remote, for example one wrapping IONOS S3, defined in `BACKUP_RCLONE_CONFIG`. It has to be a crypt remote because the dump holds plaintext tables: exercises, logos, e-mail addresses, audit entries.
- **Daily run.**
  1. `pg_dump -Fc` streams to `db/<date>.dump`; it is uploaded as `.partial` and renamed when complete.
  2. `rclone sync` mirrors the blob dir into `blobs/current/` and moves replaced or deleted files to `blobs/deleted/<date>/`. It runs only if the sentinel exists.
  3. Dumps and `deleted/` sets older than `BACKUP_RETENTION_DAYS` (default 30) are removed.
- **Erasure.** An erased record survives in backups for at most `BACKUP_RETENTION_DAYS`, plus the in-app grace period. This bound is documented in the Art. 30 record.
- **Restore.** Stop the stack. Run `rclone cat remote:db/<date>.dump | docker compose … exec -T db pg_restore --clean --if-exists -U <user> -d <db>`. Then `rclone sync remote:blobs/current <host blob dir>`, and start the stack again.
