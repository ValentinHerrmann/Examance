# Trash: capture, restore, purge (issues #125 and #196)

Every teacher delete first copies exactly the rows it removes into `trash_items`, then hard-deletes them. For `RETENTION_GRACE_DAYS` (7) the teacher can bring the group back on the Trash page (`/trash`, account menu) or erase it at once. Code: `backend/app/services/trash.py`, model `models/trash_item.py`, router `routers/trash.py`, migration `0049_trash_items`. Rules that must hold are in `backend/CLAUDE.md`.

## What it replaces

- The soft delete of exams and submissions (a row with `deleted_at` that retention erased later). Both are now a capture plus a hard delete. Exam *expiry* through retention (`retention_until`) is unchanged and does not use the trash.
- `POST /user/restore-server-data` and the Settings card "Restore results deleted from the server". It reported 0 because the UI's scan delete called `DELETE /students/{hmac}` (the GDPR hard delete), which also removed the soft-deleted submission it was meant to restore (issue #196).

## Entries and groups

One `trash_items` row is an *entry*: the copy of one delete. The client sends `X-Trash-Group: <uuid>` on every request of one UI action (deleting a student whose scans are also cleared, "delete all submissions"), so the Trash page shows one item and restore or purge acts on the whole group. Without the header (or with an invalid one) each request is its own group (`trash_scope`).

Columns: `id`, `teacher_id` (FK, cascade), `group_id`, `kind`, `exam_id` (no FK, label only), `label`, `payload`, `blob_refs`, `deleted_at`, `purge_after`.

- `label` (JSON) is what the list shows: ids, the plaintext exam title or exercise name, row counts per table under `counts`. Result entries also carry the sealed student identity (`pii_ciphertext_b64`, `iv_b64`, `encryption_salt_b64`, plus `pseudonym_hmac` and `pseudonym_version`) that the browser decrypts to show the name. The server never sees that name.
- `payload` is zlib-compressed JSON `{"rows": {table: [row]}, "fills": [...], "meta": {...}}`. Columns are copied as stored: encrypted columns stay ciphertext, bytes are base64, datetimes ISO strings, UUIDs strings (`_decode` turns them back by the column type, so no type tags). The copy reads the Core table, so deferred columns (`scan_ciphertext`) are included.
- `blob_refs` lists the scan files (blob store refs) of the captured `scan_submissions`.
- `meta` holds what a restore needs to judge the rows: `pseudonym_versions` for result kinds, `promoted` for exercises.

## Kinds and what they capture

| Kind | Delete path | Captures |
|---|---|---|
| `exam` | `DELETE /exams/{id}` | exam, MC groups, exercise links, exam logo, student identities, submissions, their scores |
| `exam_links` | `PATCH /exams/{id}` | MC groups and exercise links the edit dropped |
| `student` | `DELETE /exams/{e}/students/{hmac}` | identity, the student's submissions and scores |
| `submission` | `DELETE .../submissions/{id}` | the submission and its scores |
| `scores` | `DELETE .../scores`, `.../scores/{exercise_id}` | the `exercise_scores` rows |
| `grading` | `DELETE .../submissions/{id}/grading` | fill: annotations and total score cleared in place, plus the scores deleted |
| `annotations` | `POST .../submissions` with `clear_annotations` | fill: annotation ciphertext and IV cleared in place |
| `exercise` | `DELETE /exercises/{id}` | the version, its resource files, exam links and scores on it |
| `resource` | `DELETE /exercises/{id}/resources/{rid}` | the resource file |
| `teacher_logo` | `PUT`/`DELETE /user/logo` dropping an own logo | fill/insert of the logo row |
| `exam_logo` | `PUT /exams/{id}/logo` (mode account or none dropping an own file) | fill/insert of the logo row |
| `contribution` | reject or withdraw a proposal | fill: LaTeX body, answers, status and decision cleared by the close, plus its resource files |

Snapshot builders are `snapshot_*` in the service. They only read; the router then deletes through `snap.delete(db)`, which removes exactly the copied rows (children first, chunked), so the capture and the delete can never differ. An empty snapshot stores nothing.

## Restore

`POST /trash/{group_id}/restore` runs `trash.restore` in one transaction:

1. All entries of the group are decoded. If any touches a result table (`student_identities`, `scan_submissions`, `exercise_scores`) the account needs the `server_results` feature (`403 ERR_FEATURE_NOT_ALLOWED`); restoring results is a result write. A group without result rows (exercises, logos, an exam without results) has no gate.
2. Rows are inserted in `TABLE_ORDER` (parents first). A restore **never overwrites** a live row. Skips are reported, not errors:

| Reason | Meaning |
|---|---|
| `already_exists` | the primary key or a unique key is taken again (re-created since, or never deleted) |
| `parent_missing` | a required parent is gone (the exam, exercise or submission was erased afterwards) |
| `detached` | a nullable link to a gone parent was cleared and the row restored without it |
| `pseudonym_changed` | the exam's `pseudonym_version` differs from the one at capture (a rekey renamed all values since); the old values would match nobody |
| `older_version` | see below |
| `changed_since` | a fill target is no longer empty |
| `gone` | a fill target no longer exists |

3. **Fills** undo an in-place clear: the captured columns are written back only while the row is still empty (`null` columns are NULL, `equal` columns match, e.g. a logo still at mode `none`). A logo row that is gone is inserted again. Anything the teacher entered after the clear wins.
4. **Version promotion.** Deleting the current version of an exercise promotes another one (`meta.promoted`). The deleted version becomes current again only if that promoted version is still current (the promotion is undone); otherwise it comes back as a non-current older version (`older_version`). The group row is locked first (`_current_rival`).
5. The group's entries are removed from the trash (`purge`) and `TRASH_RESTORED` is audited. Scan files stay on disk (they were kept for the entry).

The response is `{restored: {table: n}, skipped: [{table, id, reason}]}`; the page shows what could not come back.

## Purge, retention, accounts

- `DELETE /trash/{group_id}` (`TRASH_PURGED`) erases at once. `trash.purge` deletes the entries, then the scan files after the commit (`blob_store.delete_after_commit`) unless a live submission or another entry still references the file.
- Retention step 13 (`services/retention.py`) purges entries with `purge_after < now`. The orphan-blob sweep treats every trash `blob_ref` as referenced (`all_blob_refs`), so a file waits for its entry. `forget_scans_of_exams` is still used by retention step 11 (exam expiry); a teacher's exam delete leaves its files to the entry.
- Account deletion purges the account's trash first (`services/account_deletion.py`); the FK cascade would only remove the rows, not the files.
- Foreign or missing groups answer the same `404 ERR_TRASH_NOT_FOUND`. Expired-but-not-yet-purged entries are hidden from the list (`purge_after >= now`).
- Audit actions: `TRASH_CAPTURED` (target = entry id), `TRASH_RESTORED`, `TRASH_PURGED` (target = group id). Audit entries hash their targets, as elsewhere.

## What bypasses the trash

- `?permanent=true` on `DELETE /exams/{e}/students/{hmac}`, `DELETE .../submissions/{id}` and `DELETE .../scores`: the GDPR Art. 17 erasure (`frontend/src/lib/gdpr/erasure.ts`). It stays immediate and is audited as `DELETE`. Never route an erasure through the trash.
- Account deletion and the storage-mode move (`POST /user/purge-server-student-data`, a soft delete erased by retention after the grace period): data leaves the account on purpose.
- Exam expiry through retention.
- Backups still hold erased data until their own retention ends (`docs/backup_and_restore.md`).

## Privacy

The trash holds only what the live tables held, in the same form: encrypted columns remain ciphertext under the teacher's key, plaintext fields (exam titles, exercise content that was never encrypted) remain plaintext. Nothing is decrypted or re-encrypted on the server. The retention period is the one already documented for soft-deleted results (7 days); `docs/data_flow_and_security.md` §3 and §5 and the Art. 30 record list the trash.

## Hybrid mode

In `hybrid` mode grading results live only in the browser, so the delete flows keep a matching local trash (`frontend/src/lib/trash/localTrash.ts`): Dexie table `trash` (version 13, in `vaultTables()` so a workspace wipe clears it), rows stored exactly as already sealed (`examStudents`, `submissions`, `exerciseScores`; their AAD binds to ids that never change, so a restore re-inserts them without re-encrypting), keyed by the same group id. An entry carries only index values the rows already hold in plain (`examId`, `pseudonymHmac`, `submissionId`); names are decrypted from the rows for display. A cleared grading keeps the stored submission under `cleared` and puts it back only while the live one is still cleared. Hybrid annotation clears through a save are not kept (the record is overwritten with a new total in the same write).

- Capture happens in the repositories (`submissionRepository.delete`/`clearGrading`, `studentRepository.delete`, `scoreRepository.deleteOne`, `examRepository.deleteLocalCascade`), which take `DeleteOptions` (`lib/trash/group.ts`: `group`, `permanent`). Each UI action creates one group with `newTrashGroup()` and passes it to every call; the server calls send it as `X-Trash-Group`, which the offline queue keeps (`QueuedRequest.headers`).
- `lib/trash/trashService.ts` merges server and local entries by group id, restores the server part first (it may bring back the exam the local rows belong to), sweeps local entries after 7 days, and restores a local entry only while the account is in hybrid mode (otherwise results would land on the wrong side; see `resultsMover.ts`). The GDPR erasure (`lib/gdpr/erasure.ts`) deletes with `permanent` and also drops the student's rows from the local trash (`purgeLocalStudent`); the server does the same for its trash on `DELETE /students/{hmac}?permanent=true`.

## Admin recovery of older entries

Entries past 7 days, or after an account deletion, are in the nightly `db` backups. `./restore-backup.sh trash list <db-snapshot|latest> [teacher-email]` lists them without touching data (a temp table in the live database), and `trash restore <db-snapshot|latest> <entry-id>... [--blobs <blobs-snapshot|latest>]` copies chosen entries back into the live trash with a fresh `purge_after`, only for accounts that still exist, never overwriting. The teacher then restores in the app. A snapshot from before migration `0049` holds no `trash_items` and the command says so. Steps: `docs/backup_and_restore.md`.

## Adding a delete

Take the `trash.Trash` dependency, build a snapshot with `snapshot_*` (add one if no existing builder fits), `await trash_scope.capture(db, kind, snap, label=..., exam_id=...)`, then `await snap.delete(db)`. A table reachable by the delete (directly or by cascade) must be in `TABLE_ORDER`, or its rows would be deleted by the database without a copy. A new `kind` needs a label in the Trash page (`frontend`, i18n) and a row in the table above. Add a regression test that deletes, restores and compares.
