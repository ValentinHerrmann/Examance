# Maintenance mode (issue #130)

Warns signed-in teachers before backend downtime, pauses sign-in shortly before, freezes teaching writes while it runs, and backs up the database first. Operator view: `docs/deployment.md` (deploy flow), `docs/backup_and_restore.md` (restores).

## One window, five phases

`maintenance_window` holds at most one row (id 1); a new start replaces it and increments `revision`. The phase is decided only by `backend/app/services/maintenance.py` (`WindowState.phase`); the frontend mirrors it in `phaseAt` (`lib/stores/maintenanceStore.ts`) only to move the countdown between polls.

| Phase | From | Effect |
|---|---|---|
| `scheduled` | announcement | info banner ("at 14:00, for a few minutes") |
| `warning` | `first_warning_at` = start − 5 min (or at once) | 1st reminder dialog: save your work; mentions the 2nd reminder |
| `final` | `second_warning_at` = start − 1 min (preview, or a lead of at most 1 min: −10 s) | 2nd reminder dialog (shown even if the 1st was closed); new sessions refused (`ERR_MAINTENANCE_LOGIN_BLOCKED`), admins exempt |
| `down` | manual: `starts_at`; deployment: `frozen_at` (set by CI) | teaching endpoints answer 503 `ERR_MAINTENANCE` (in `get_teaching_teacher`); blocking notice for teachers |
| `none` | `ended_at`, or `auto_end_at` passed | normal |

- A deployment is `down` only once CI froze it, so a slow image build leaves teachers in `final` ("any moment now") instead of locking them out while nothing happens.
- `auto_end_at` for deployments: start + 15 min before the freeze (a failed or very slow build ends the window; the deploy's `if: always()` step ends it at once anyway), freeze + 45 min after it (must outlast `wait-backup`'s 15 min plus migrate and restart, so writes never resume mid-backup or mid-migration; `wait-backup` also fails once the window is no longer `down`). Manual windows end only by an admin.
- **No overwriting:** `start(kind="deployment")` raises `WindowBusyError` over an open manual window or a frozen deployment, and a manual start over a frozen deployment (admin API: `409 ERR_MAINTENANCE_DEPLOYMENT_RUNNING`). CI calls `start --wait-free 1500`: it waits up to 25 min for the window to end, then exits 75 and the deploy fails before touching anything. Preview runs queue (`cancel-in-progress: false`), so no run is cancelled mid-freeze.
- `end(revision)` / `freeze(revision)` act only on that revision: a cancelled preview run must not end the window of the run that replaced it.
- The sign-in check runs in `_require_pending` and the passkey sign-in **before** the pending token is consumed (a refused teacher keeps the step and finishes once the window ends), with `advance_sign_in` as the backstop for the first step. All points are reachable only after a proven factor, so they reveal nothing about an address. `/auth/refresh` stays allowed on purpose: open sessions survive; the pause is on new sign-ins only.
- **Credential and account writes** (password change/reset, key envelopes, TOTP and backup codes, passkeys, account deletion, storage mode, purge) depend on `require_not_frozen`: 503 `ERR_MAINTENANCE_ACCOUNT_PAUSED` while `down`, admins exempt. Without it a restore of the maintenance backup would silently revert them. The forms show the message; nothing is queued.
- 503 is on purpose: the offline queue (`isTransientError`) replays writes refused during `down`, so nothing a teacher saves then is lost. `lib/api/client.ts` never shows the HTTP error modal for the two maintenance codes; it refreshes the notice instead.
- Phase lookups are cached ~3 s per worker (`_CACHE_SECONDS`); the backup waits 5 s after the freeze for that. A write that passed the gate just before the freeze and commits after the dump (a long upload) is missing from that one backup only; it matters only if exactly that backup is restored (accepted trade-off for a short downtime).
- Every restore (`restore-backup.sh db|maintenance|undo`) ends any open window after migrating: a maintenance dump contains its own open window.

## How clients learn of a window

- Idle poll every 15 s (10 s while open, 5 s while down), plus a refetch on focus, visibility, `online` and `pageshow`: background tabs and phones throttle timers, and a preview window lasts only 30 s.
- `MaintenanceHeaderMiddleware` adds `Maintenance-Revision: N` to `/api/*` responses while a window is open, read only from the worker's fresh phase cache (no DB access). `api/client.ts` refetches when the revision is new to it, so an active teacher sees the reminder with the next request. A missing header means "unknown", never "no window".
- A device that first sees a window already `down` gets the blocking notice only; there is nothing left to save then.

## Presence counts

Signed-in teachers' polls of the public `GET /api/v1/maintenance` mark them online (90 s window) and, while a window is open, "warned" for its revision; "I've saved my work" (`POST /maintenance/ready`) marks "ready". Stored in Redis sorted sets (`ephemeral_store.mark_member` / `members_since`, in-memory fallback without Redis) under a SHA-256 of the account id, expiring after 2 h; only counts leave the server (`GET /admin/maintenance`). Redis configured but unreachable: counts are `null` and the UI says "unknown", never 0. Admin sessions are not counted. The rate limit is 600/min per IP because a school's teachers share one address.

## Deploy integration

Both deploy workflows' `backend-deploy` job (see `docs/deployment.md`):

1. `cli maintenance start --kind deployment --lead-seconds 300 --second-warning-seconds 60 --wait-free 1500` through the **running** image (`docker compose exec backend python -m app.cli`), in parallel with the image build. Keep the CLI's names and options stable: CI always calls the previous release's CLI (an image without `--wait-free` is called again without it). Exit 75 = another window is open: the deploy fails. No revision (no CLI yet, no stack): the deploy runs as before.
2. Wait (15 min max) for the newest "Build backend image" job of this run across attempts (`jobs?filter=all`, transient API errors tolerated), pull. A failed build ends the window right away via step 5.
3. `maintenance freeze --wait --revision N` (sleeps until `starts_at`, at most 15 min, then freezes), `maintenance wait-backup --revision N` (fails on `failed` or after 15 min): the deploy aborts before `migrate` on any failure. If the running image's CLI fails, both steps are retried once with the new image's CLI (`migrate` service), so a CLI bug in one release cannot block every later deploy. Each CLI step is its own `asyncio.run`, so `_in_session` disposes the engine afterwards (pooled asyncpg connections are bound to their loop).
4. migrate, `up -d`, health check (unchanged).
5. `if: always()`: `maintenance stop --revision N`.

## Maintenance backup

The `maintenance-backup` compose service (no profile; independent of the nightly `backup` service) polls every 5 s and claims a due backup with one conditional `UPDATE ... RETURNING revision` (`backup_wanted`, `backup_state IS NULL`, frozen or manual start passed by 5 s). It writes `maintenance-backups/<UTC>-rev<N>.sql` (`pg_dump --no-owner`, `.part` then rename, umask 077), sets `backup_state` `done`/`failed`, keeps the newest `BACKUP_KEEP_MAINTENANCE` files, then (CI already continued) uploads the file to restic with tag `maintenance` when a repository is configured and records `offsite_state`. Its SQL is coupled to the table: rename a column and the service breaks. Deployments always back up; manual windows when the admin keeps "back up first" on. Restore: `./restore-backup.sh maintenance [latest|<file>|<id>]`.
