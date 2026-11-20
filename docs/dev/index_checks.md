# Index and migration checks (issue #315)

Two checks that need a production-sized database, so the operator runs them and posts the output on issue #315. Nothing here changes data. An index is added only where a query below shows it helps.

## 1. Date columns without an index

Run each statement in `psql` against the production database (or a recent restore of it). `ANALYZE` executes the query, so run them outside the busiest hours.

Admin audit page (`backend/app/routers/admin/users.py`, newest entries first, one page):

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM audit_logs ORDER BY created_at DESC OFFSET 0 LIMIT 50;
```

Daily retention run (`backend/app/services/retention.py`):

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM exams WHERE retention_until < CURRENT_DATE AND deleted_at IS NULL;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM student_identities WHERE retention_until < CURRENT_DATE AND deleted_at IS NOT NULL;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM scan_submissions WHERE retention_until < CURRENT_DATE AND deleted_at IS NOT NULL;

-- 365 is the default of AUDIT_LOG_RETENTION_DAYS; use your installation's value.
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM audit_logs WHERE created_at < now() - interval '365 days';

EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM refresh_tokens WHERE expires_at < now();
```

Table sizes, for reading the plans:

```sql
SELECT relname, n_live_tup FROM pg_stat_user_tables
WHERE relname IN ('audit_logs', 'exams', 'student_identities', 'scan_submissions', 'refresh_tokens');
```

**Reading the result.** A `Seq Scan` on a table with tens of thousands of rows or more, and an execution time of more than a few tens of milliseconds, means an index helps. That holds above all for the audit page, which runs on every page view. A `Seq Scan` on a small table, or on a query that runs once a day and takes milliseconds, does not. An index that helps comes as a migration plus `index=True` on the model column, in one PR.

## 2. The preview's migration history

`backend/alembic/versions/0054_result_delivery.py` notes that the preview stack once ran this migration under the id `0052_result_delivery`, which is not in the chain. If a database still holds that id, `alembic upgrade` stops with an unknown revision.

On the preview database:

```sql
SELECT version_num FROM alembic_version;
```

- It shows the current head (`alembic heads` in the backend container): nothing to do.
- It shows `0052_result_delivery`: the database ran the result-delivery migration right after `0051_result_shares`, under an old name, and nothing after it. In the backend container run `alembic stamp 0051_result_shares`, then `alembic upgrade head`.
  - The upgrade then runs main's `0052` and `0053` (which add and drop `exams.cut_corner`) and `0054_result_delivery`, which skips the columns that already exist.
  - Never stamp straight to `0054`: that would skip `0052` and `0053`.
  - `stamp` only rewrites the recorded version, not the schema.
