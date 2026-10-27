# Dev database setup

## Purpose
Create the backend schema (all B1–B5 tables + master seed) in an empty database, check it, and get login working again.
Use it for a new dev database, or to rebuild the dev schema from zero.
Do not use it on a database with data you need: the rollback drops every table and all its data.

## Prerequisites
- SQL Server Management Studio (SSMS) or `sqlcmd`, with rights to create tables (and to create a database for step 1).
- Bruno with the `bruno/AYT-RFID` collection (step 5).
- Environment variables in `backend/.env` (names only): `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
- Allowed environment: local / dev database only. Never prod.

## Scripts
| Script | Does |
|---|---|
| `backend/scripts/setup_dev_database.sql` | Creates the empty database `db_rfid_assembly_dev` if it does not exist |
| `backend/backup_DB_SP/create_assy_core.sql` | Up: creates the 12 tables, indexes and constraints, and seeds process / locations / statuses. One transaction. Has no `USE` line |
| `backend/backup_DB_SP/create_assy_core.down.sql` | Down: drops the same 12 tables with all data, including users. One transaction |

## Steps

1. **Create the database** (only if it does not exist yet). Run `setup_dev_database.sql`.
2. **Create the schema.** Select the target database first (SSMS database dropdown, or `sqlcmd -d <db>`). Then run `create_assy_core.sql`.
   - A second run is safe. It prints `create_assy_core: a target table already exists. Nothing was changed.` and changes nothing.
3. **Verify.** Run the queries below on the same database.
4. **Point the backend at it.** Set `DB_NAME` in `backend/.env` to that database.
5. **Create the first user.** Start the backend (`node server.js` in `backend/`). Run Bruno `User - Create` with a fake `emp_id` and password, then Bruno `Login` with the same values. No user is seeded.

Command form for `sqlcmd` (folder: repo root):

    sqlcmd -S <server> -E -d <db> -b -i backend/backup_DB_SP/create_assy_core.sql

`-E` = Windows authentication (use `-U` / `-P` for SQL login). `-b` = stop with an error exit code when a batch fails.

### Verify queries

```sql
-- Expect: 1, 3, 4
SELECT (SELECT COUNT(*) FROM tb_master_process)     AS processes,
       (SELECT COUNT(*) FROM tb_master_location)    AS locations,
       (SELECT COUNT(*) FROM tb_master_assy_status) AS statuses;
GO

-- Expect: 2 REGISTERED bf_gr_f1 / 3 GR_F1 gr_f1 / 4 MC_F1 mc_f1 / 5 CLEARED NULL
SELECT s.seq, s.status_code, l.location_code
FROM tb_master_assy_status s
LEFT JOIN tb_master_location l ON l.id = s.location_id
ORDER BY s.seq;
GO

-- Expect: error 547 (CHECK constraint CK_master_assy_status_location_rule). Nothing is saved.
BEGIN TRAN;
INSERT INTO tb_master_assy_status (status_code, status_label, seq, location_id)
VALUES ('X_TEST', 'x', 9, NULL);
ROLLBACK;
GO

-- Expect: error 2601 (unique index UX_master_assy_status_location). Nothing is saved.
BEGIN TRAN;
INSERT INTO tb_master_assy_status (status_code, status_label, seq, location_id)
SELECT 'X_TEST', 'x', 9, id FROM tb_master_location WHERE location_code = 'gr_f1';
ROLLBACK;
GO
```

Keep the `GO` lines. The up script turns on `XACT_ABORT`, and the setting stays on in the same SSMS window. With it on, an error stops the rest of its batch, so without `GO` the 547 error would skip the 2601 check.

If an error query leaves a transaction open (SSMS shows open transactions on close), run `ROLLBACK;` once.

## Expected output
- Pass: step 2 ends with no error; the verify queries return the expected values and the two expected error numbers.
- Fail: any error in step 2. The script is one transaction, so a failed run leaves no new tables. Fix the cause and run it again.

## Stop and clean up
Rollback = run `create_assy_core.down.sql` on the same database.

**Data loss:** it drops all 12 tables with all data, including every user in `tb_assy_login`. Confirm each time before you run it. Tables that do not exist are skipped.

## Who runs it
User runs it (real database). Claude never runs these scripts.
Send back: the result grids of the first two verify queries, and the error number + message of the last two. Remove server names if they appear.
