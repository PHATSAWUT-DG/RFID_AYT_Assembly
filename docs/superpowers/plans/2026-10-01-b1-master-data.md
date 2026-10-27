# B1 Master Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` to implement this plan task by task, **inline in the main session**. Never use subagents (user rule). Steps use checkbox (`- [ ]`) syntax. After each task: stop, show the diff, wait for the user's review. Never run `git add` / `git commit`; list the files and suggest a commit message instead. Never run SQL against a database; the user runs it.

**Goal:** Create the new schema (all B1–B5 tables + seed) and give admins CRUD for processes, locations and statuses on the new layers, replacing the old `/process` and `/status` handlers.

**Architecture:** One up / down SQL pair creates every new table in one transaction. A `master` module (`modules/master/`) follows route → controller → service → repository. The service maps SQL constraint errors (unique, foreign key, reference) to `AppError` codes, so the DB stays the final guard and the service gives a clear message. `modules/master/index.js` wires the layers; `server.js` mounts the module router before the old `routes/assembly.js`.

**Tech Stack:** SQL Server (T-SQL), Node 22 (CommonJS), Express 5.2, mssql 12, zod 4, `node:test` + `node:assert`, Bruno YAML.

**Spec:** `docs/superpowers/specs/2026-10-01-backend-redesign-design.md` (sections 5.2, 5.3, 6, 7.8, 9). Roadmap: `docs/superpowers/plans/2026-10-01-backend-redesign-roadmap.md`. Uses B0 code: `shared/AppError.js`, `shared/validate.js`, `shared/sqlErrors.js`, `app.js`, `test/helpers/startApp.js`, `test/helpers/fakeDb.js`.

## Global Constraints

- Table names keep the `tb_assy_` / `tb_master_` prefix (P2). API base stays `/api/assembly` (P3).
- All timestamps use DB time `SYSDATETIME()`, type `DATETIME2` (P10).
- Code refers to statuses **by code**, never by id. System statuses: `REGISTERED`, `CLEARED`.
- Status CHECK rule: `CLEARED` ⇔ `location_id IS NULL` (D18, D19). One status per location (filtered unique index).
- Locations are deactivated (`is_active = 0`), not deleted. No `DELETE /locations/:id`.
- Error body: `{ "error": "<CODE>", "message": "<text>", "details"?: [...] }`.
- Layers: routes (path + `validate` + controller), controller (read `req.valid`, call service, send status + JSON), service (rules, error mapping), repository (parameterized SQL only).
- Dependency injection: `createMasterService({ repo, db })`. Unit tests pass fakes. No test touches a real DB.
- New code imports `db.js` only (`query`, `transaction`, `typed`). Never `database.js` or `getPool()`; B1.5 removes `database.js`.
- Every endpoint has its Bruno request in the same task (`bruno-docs` skill). Fake data only. Old Bruno files for removed routes are deleted in the same task.
- I never run SQL. I show up / down SQL; the user runs it. The down script needs the user's explicit OK every time it runs.

## Decisions made in this plan (not in the spec yet)

The spec leaves these open. Each one is written back into the spec in the task that uses it.

| # | Decision | Why | Spec edit in |
| --- | --- | --- | --- |
| M1 | The up script has **no `USE`** line. You pick the database first (SSMS dropdown or `sqlcmd -d`). | `DB_NAME` differs per machine (`db.js:6`). A hard-coded `USE` can create the tables in the wrong DB. | B1.1 (5.3) |
| M2 | `setup_dev_database.sql` only creates the empty database. Then you run `create_assy_core.sql` on it. | One source for the schema. A copy in two files drifts. (Spec 5.3 says "same tables + seed" in both.) | B1.1 (5.3) |
| M3 | The up script is **one transaction** (`SET XACT_ABORT ON`), with a guard that stops if `tb_assy_lot` already exists. | All or nothing. A second run changes nothing. | B1.1 (5.3) |
| M4 | O1: the up script also recreates `tb_assy_login`, `tb_assy_api_log`, `tb_assy_mock_as400`, `tb_assy_mock_done` (old columns, widened, `DATETIME2`). `tb_assy_login.emp_id` becomes `NOT NULL UNIQUE`. No user is seeded (no secrets in the repo); you create the first user with Bruno `User - Create`. | Login works again before B6; B2 / B4 need the log and mock tables. | B1.1 (5.2 "Other tables") |
| M5 | Paths: `/processes`, `/locations`, `/statuses` (plural, flat, like `/lots`, `/tags`). Create = `POST` → 201 + row. Update = `PUT /:id` with the full body → 200 + row. Delete = `DELETE /:id` → 204. List = `GET` → plain array. | Admin forms send the whole row. Plain arrays match what the FE reads today. | B1.2b (7.8) |
| M6 | New error codes: `MASTER_NOT_FOUND` 404 (id not found), `MASTER_DUPLICATE` 409 (unique code / one status per location), `MASTER_INVALID_REF` 422 (`process_id` / `location_id` does not exist). `MASTER_IN_USE` 409 also covers "system status code cannot change". | Spec section 9 has no code for these cases. | B1.2b (9) |
| M7 | The status CHECK rule is checked in the **zod schema** (`superRefine`), not in the service. It returns 400 `VALIDATION_ERROR` with `details`. | The rule uses only body fields, so it is input shape. Spec 7.8 says "in the service"; this is the same rule, one layer earlier. | B1.4a (7.8) |
| M8 | `status_code` is trimmed and upper-cased by zod; it must match `^[A-Z0-9_]+$`. `process_code` and `location_code` are only trimmed (the reader sends lower-case location codes, e.g. `gr_f1`). | The DB collation is case-insensitive: `cleared` would collide with the CHECK rule and the unique index in confusing ways. | B1.4a (5.2) |

## Review Focus

1. **Status code in lower case** (`cleared`, `registered`) → treated as `CLEARED` / `REGISTERED`: the location rule and the system-status lock apply. Pinned in B1.4a (schema test + service test).
2. **Delete a row that is still used** (process with a location, status with a lot or an event) → 409 `MASTER_IN_USE`, not 500. Pinned in B1.2a (service test, fake 547 REFERENCE error) and B1.4a.
3. **Second status on a location that already has one** → 409 `MASTER_DUPLICATE` with `details[0].path = 'location_id'`, not 500. Pinned in B1.4a.
4. **Bad `:id`** (`abc`, `0`, `1.5`) → 400 `VALIDATION_ERROR`, not a SQL conversion 500. Pinned in B1.2b (route test).
5. **Edit a system status without changing its code** (label or `seq` only) → allowed. Changing the code → 409 `MASTER_IN_USE`. Pinned in B1.4a.

---

## File map

| File | Status | Duty | Task |
| --- | --- | --- | --- |
| `backend/sql/create_assy_core.sql` | Create | Up: all new tables, indexes, constraints, seed | B1.1 |
| `backend/sql/create_assy_core.down.sql` | Create | Down: drop every table the up script created | B1.1 |
| `backend/scripts/setup_dev_database.sql` | Rewrite | Create the empty dev DB only (M2) | B1.1 |
| `backend/sql/dbo.{tb_master_process,tb_master_assy_status,tb_assy_lot,tb_assy_tag,tb_assy_login,tb_assy_api_log,tb_assy_mock_as400,tb_assy_mock_done}.Table.sql` | Delete | Old definitions of tables the up script now owns | B1.1 |
| `docs/runbooks/dev-database-setup.md` | Create | Create DB, run up, verify, first user, roll back | B1.1 |
| `backend/shared/sqlErrors.js` | Modify | Add `getConstraintConflict(err)` | B1.2a |
| `backend/modules/master/repository.js` | Create | Parameterized SQL for the three tables | B1.2a, B1.3, B1.4a |
| `backend/modules/master/service.js` | Create | `createMasterService({ repo, db })`: rules + error mapping | B1.2a, B1.3, B1.4a |
| `backend/modules/master/schemas.js` | Create | zod schemas | B1.2b, B1.3, B1.4a |
| `backend/modules/master/controller.js` | Create | `createMasterController({ service })` | B1.2b, B1.3, B1.4a |
| `backend/modules/master/routes.js` | Create | `createMasterRoutes({ controller })` → `express.Router` | B1.2b, B1.3, B1.4a |
| `backend/modules/master/index.js` | Create | `createMasterModule({ db })` → router (wiring) | B1.2b |
| `backend/server.js` | Modify | Mount master module before `routes/assembly.js` | B1.2b |
| `backend/routes/assembly.js` | Modify | Delete `/process` (B1.2b) and `/status` (B1.4a) handlers + imports | B1.2b, B1.4a |
| `backend/services/masterService.js`, `backend/test/unit/masterService.test.js` | Delete | Replaced by the module | B1.4b |
| `backend/sql/dbo.Stored_tb_master_*.StoredProcedure.sql` (8 files) | Delete | Old master SPs | B1.4b |
| `backend/test/unit/shared/sqlErrors.test.js` | Modify | Tests for `getConstraintConflict` | B1.2a |
| `backend/test/unit/modules/master/service.test.js` | Create | Service rules with a fake repo | B1.2a, B1.3, B1.4a |
| `backend/test/unit/modules/master/routes.test.js` | Create | HTTP: validation, status codes, controller → service | B1.2b, B1.3, B1.4a |
| `backend/test/unit/modules/master/schemas.test.js` | Create | Status rule + code normalization | B1.4a |
| `bruno/AYT-RFID/master/*.yml` | Create | One request per endpoint (11) | B1.2b, B1.3, B1.4a |
| `bruno/AYT-RFID/Process - *.yml`, `Status - *.yml` | Delete | Old routes | B1.2b, B1.4a |
| `backend/db.js` | Modify | Take over pool config + `createPoolGetter` from `database.js` | B1.5 |
| `backend/database.js`, `backend/test/unit/database.test.js` | Delete | Merged into `db.js` / `db.test.js` | B1.5 |
| `backend/test/unit/db.test.js` | Modify | Gets the 3 pool tests | B1.5 |
| `backend/routes/assembly.js`, `backend/scripts/rehash_passwords.js` | Modify | Import `getPool` from `db.js` | B1.5 |
| `backend/README.md` | Create | Folder map, naming, layer rules, legacy list | B1.6 |
| `backend/CLAUDE.md` | Create | One line: `@README.md` | B1.6 |
| `overview_diagram/README.md` | Modify | Stale banner at the top only | B1.6 |

## Task status

| # | Task | Model / effort / where | Status |
| --- | --- | --- | --- |
| B1.1 | Up / down SQL + dev DB script + runbook | Opus 5.5, high — main session | [x] `create_assy_core.sql`, `.down.sql`, `setup_dev_database.sql`, runbook, spec 5.2 / 5.3, roadmap O1; 8 old `.Table.sql` deleted. Run by the user, tests passed. Ruling: the guard is its own batch and checks all 12 tables, not only `tb_assy_lot` (`SET NOEXEC ON` only skips the batches after it) |
| B1.2a | `getConstraintConflict` + master repository / service: processes | Sonnet 5, medium | [x] `shared/sqlErrors.js:13`, `modules/master/{repository,service}.js`; tests 65/65 |
| B1.2b | Processes HTTP: schemas, controller, routes, wiring, Bruno, delete old `/process` | Sonnet 5, medium | [x] `modules/master/{schemas,controller,routes,index}.js`, `server.js`, `routes/assembly.js`; tests 73/73. User Bruno run pending |
| B1.3 | Locations: repository, service, HTTP, Bruno | Sonnet 5, medium | [x] `modules/master/*`, `bruno/AYT-RFID/master/Locations - *.yml`; tests 86/86. User Bruno run pending |
| B1.4a | Statuses: rules, HTTP, Bruno, delete old `/status` | Sonnet 5, high | [x] code, tests (117/117), Bruno, spec 7.8 / 5.2 done. User Bruno run pending |
| B1.4b | Delete `masterService.js`, its test, old master SP files | Haiku 4.5, low | [x] 10 files deleted; `asResult` moved to `userService.js:5`; tests 107/107 |
| B1.5 | Merge `database.js` into `db.js` | Haiku 4.5, low | [x] `db.js:3-32`; `database.js` and its test deleted; 3 tests moved to `db.test.js`; 107/107 |
| B1.6 | Backend conventions doc (`README.md` + `CLAUDE.md` import); close B1 in the roadmap | Sonnet 5, medium — main session | [x] `backend/README.md`, `backend/CLAUDE.md`, banner on `overview_diagram/README.md` |
| B1.6-lint | ESLint for the backend (file name case, layer import rules) | — | [-] DEFERRED: the backend has no ESLint yet, so this is a setup task of its own, not 2 rules. Resume as its own roadmap row: flat config, `eslint-plugin-n` for `require` bans, fix or ignore existing errors. |

Where:

```
Main session (Opus 5.5, high):          B1.1 — migration needs our discussion; you run the SQL
New session (Sonnet 5, medium):         B1.2a, B1.2b, B1.3 — same files, one after another
Same session, effort high:              B1.4a — status rules are the tricky part
Same session or new (Haiku 4.5, low):   B1.4b, B1.5 — deletions and a mechanical merge
Main session (Sonnet 5, medium):        B1.6 — describes the pattern B1.2–B1.5 produced
```

Handoff for the new session: "Execute `docs/superpowers/plans/2026-10-01-b1-master-data.md` from task B1.2a with `superpowers:executing-plans`, inline, one task at a time, wait for my review after each. B1.1 is done and the schema is in the dev DB."

---

### Task B1.1: Up / down SQL, dev DB script, runbook

**Why:** Every later branch needs the new tables. Login is broken until `tb_assy_login` exists again (O1).

**Files:**
- Create: `backend/sql/create_assy_core.sql`, `backend/sql/create_assy_core.down.sql`
- Rewrite: `backend/scripts/setup_dev_database.sql`
- Delete: the 8 old `dbo.*.Table.sql` files listed in the file map
- Create: `docs/runbooks/dev-database-setup.md`
- Modify: spec 5.2 ("Other tables"), 5.3 (M1–M4); roadmap O1

**Interfaces:**
- Produces: the constraint and index names below. Later tasks match on them (`getUniqueViolationName`, `getConstraintConflict`), so they are fixed:

| Table | Names |
| --- | --- |
| `tb_master_process` | `PK_master_process`, `UQ_master_process_code`, `DF_master_process_can_clear_tag` |
| `tb_master_location` | `PK_master_location`, `UQ_master_location_code`, `FK_master_location_process`, `DF_master_location_is_active`, `DF_master_location_created_at` |
| `tb_master_assy_status` | `PK_master_assy_status`, `UQ_master_assy_status_code`, `FK_master_assy_status_location`, `UX_master_assy_status_location` (filtered), `CK_master_assy_status_location_rule` |
| `tb_assy_lot` | `PK_assy_lot`, `UQ_assy_lot_lot_no`, `FK_assy_lot_status`, `IX_assy_lot_wos`, `IX_assy_lot_status` |
| `tb_assy_tag` | `PK_assy_tag`, `UQ_assy_tag_code` |
| `tb_assy_pairing` | `PK_assy_pairing`, `FK_pairing_lot`, `FK_pairing_tag`, `UX_pairing_active_lot`, `UX_pairing_active_tag`, `IX_pairing_lot` |
| `tb_assy_pairing_event` | `PK_assy_pairing_event`, `FK_event_pairing`, `FK_event_from_status`, `FK_event_to_status`, `FK_event_location`, `CK_event_type`, `CK_event_source`, `IX_event_pairing`, `IX_event_created` |
| `tb_assy_unknown_read` | `PK_assy_unknown_read`, `FK_unknown_read_location`, `UQ_unknown_read_tag_location` |
| `tb_assy_login` | `PK_assy_login`, `UQ_assy_login_emp_id` |
| `tb_assy_api_log` | `PK_assy_api_log`, `IX_api_log_created` |
| `tb_assy_mock_as400` | `PK_assy_mock_as400`, `UQ_mock_as400_lot_no` |
| `tb_assy_mock_done` | `PK_assy_mock_done`, `UQ_mock_done_lot_no` |

Defaults not named above use `DF_<table-short>_<column>`.

- [ ] **Step 1: Write `create_assy_core.sql`**

Columns, types and rules: exactly spec 5.2. Structure:

```sql
-- Run against the target database (select it first; this script has no USE). See docs/runbooks/dev-database-setup.md.
-- Filtered indexes need ANSI_NULLS and QUOTED_IDENTIFIER ON for every session that writes these tables (mssql driver default: ON).
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO
SET XACT_ABORT ON;
IF OBJECT_ID('dbo.tb_assy_lot') IS NOT NULL
BEGIN
    RAISERROR('tb_assy_lot already exists. Nothing was changed. Run the down script first if you want a clean schema.', 16, 1);
    SET NOEXEC ON;
END
BEGIN TRANSACTION;
-- CREATE TABLE ... in FK order: process, location, status, lot, tag, pairing, pairing_event, unknown_read,
-- then login, api_log, mock_as400, mock_done. Then indexes. Then seed.
COMMIT TRANSACTION;
GO
SET NOEXEC OFF;
GO
```

Details the spec does not pin:
- Filtered uniques: `CREATE UNIQUE INDEX UX_master_assy_status_location ON tb_master_assy_status (location_id) WHERE location_id IS NOT NULL;` same shape for `UX_pairing_active_lot` / `UX_pairing_active_tag` with `WHERE closed_at IS NULL`.
- CHECK: `CONSTRAINT CK_master_assy_status_location_rule CHECK ((status_code = 'CLEARED' AND location_id IS NULL) OR (status_code <> 'CLEARED' AND location_id IS NOT NULL))`.
- `tb_assy_pairing_event.created_at` is `DATETIME2(3)`; all other timestamps `DATETIME2(0)`.
- Seed looks up ids **by code**, never by literal id (no `IDENTITY_INSERT`):
  - `tb_master_process`: `('1500', 'GAUGING', 1)`.
  - `tb_master_location`: `bf_gr_f1` / `gr_f1` / `mc_f1` from spec 5.2, `process_id = (SELECT id FROM tb_master_process WHERE process_code = '1500')`.
  - `tb_master_assy_status`: the 4 rows of spec 5.2, `location_id` by `location_code`, `CLEARED` → `NULL`.
- M4 tables:

| Table | Columns |
| --- | --- |
| `tb_assy_login` | `id INT IDENTITY PK`, `emp_id VARCHAR(10) NOT NULL UNIQUE`, `eng_name VARCHAR(100) NULL`, `eng_surname VARCHAR(100) NULL`, `password VARCHAR(72) NOT NULL` (bcrypt, from `alter_login_password_width.sql`), `position VARCHAR(50) NULL` |
| `tb_assy_api_log` | `id BIGINT IDENTITY PK`, `api_type VARCHAR(20) NOT NULL`, `method VARCHAR(10) NULL`, `url VARCHAR(500) NULL`, `request_params VARCHAR(500) NULL`, `request_body VARCHAR(MAX) NULL`, `http_status INT NULL`, `status VARCHAR(20) NULL`, `response VARCHAR(MAX) NULL`, `error_msg VARCHAR(500) NULL`, `response_time_ms INT NULL`, `created_at DATETIME2(3) NOT NULL DEFAULT SYSDATETIME()`; index `IX_api_log_created (created_at)`. Same column names as `services/apiLogService.js:1`, so it keeps working. B2.1 may change this table. |
| `tb_assy_mock_as400` | `id INT IDENTITY PK`, `lot_no VARCHAR(15) NOT NULL UNIQUE`, `wos VARCHAR(20) NULL`, `brg_type VARCHAR(30) NULL`, `spec VARCHAR(20) NULL`, `qty INT NULL`, `created_at DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()` (widths match `tb_assy_lot`) |
| `tb_assy_mock_done` | `id INT IDENTITY PK`, `lot_no VARCHAR(15) NOT NULL UNIQUE`, `created_at DATETIME2(0) NOT NULL DEFAULT SYSDATETIME()` |

- [ ] **Step 2: Write `create_assy_core.down.sql`**

Header comment: "Drops every table `create_assy_core.sql` created, **with all data, including users in `tb_assy_login`**. Needs explicit confirmation each run." One transaction with `SET XACT_ABORT ON`. Drop in reverse FK order with `IF OBJECT_ID('dbo.<table>') IS NOT NULL DROP TABLE dbo.<table>;` (works on every SQL Server version, unlike `DROP TABLE IF EXISTS`).

- [ ] **Step 3: Rewrite `scripts/setup_dev_database.sql`**

Only: `IF DB_ID('db_rfid_assembly_dev') IS NULL CREATE DATABASE db_rfid_assembly_dev;` and a comment: "Next: select this database and run `backend/sql/create_assy_core.sql`. See `docs/runbooks/dev-database-setup.md`." All old tables, SPs and seed in this file go.

- [ ] **Step 4: Delete the 8 old `dbo.*.Table.sql` files** (file map). Keep `dbo.tb_assy_log.Table.sql`, `dbo.tb_assy_wos.Table.sql` and all SP files; the branches that replace them delete them (spec 5.3).

- [ ] **Step 5: Write `docs/runbooks/dev-database-setup.md`** with the `runbook-docs` skill

Steps: (1) run `setup_dev_database.sql` (only for a new DB); (2) select the DB, run `create_assy_core.sql`; (3) verify with the queries below; (4) set `DB_NAME` in `backend/.env`; (5) create the first user with Bruno `User - Create`, then log in with Bruno `Login`; (6) roll back: `create_assy_core.down.sql`, data loss warning. Env variable names only.

Verify queries (each test runs in a transaction that is rolled back):

```sql
SELECT (SELECT COUNT(*) FROM tb_master_process) AS processes,      -- 1
       (SELECT COUNT(*) FROM tb_master_location) AS locations,     -- 3
       (SELECT COUNT(*) FROM tb_master_assy_status) AS statuses;   -- 4
SELECT s.seq, s.status_code, l.location_code FROM tb_master_assy_status s
LEFT JOIN tb_master_location l ON l.id = s.location_id ORDER BY s.seq;  -- REGISTERED bf_gr_f1, GR_F1 gr_f1, MC_F1 mc_f1, CLEARED NULL

BEGIN TRAN;  -- expect error 547 (CHECK): an active status with no location
INSERT INTO tb_master_assy_status (status_code, status_label, seq, location_id) VALUES ('X_TEST', 'x', 9, NULL);
ROLLBACK;
BEGIN TRAN;  -- expect error 2601: a second status on gr_f1
INSERT INTO tb_master_assy_status (status_code, status_label, seq, location_id)
SELECT 'X_TEST', 'x', 9, id FROM tb_master_location WHERE location_code = 'gr_f1';
ROLLBACK;
```

Also: running `create_assy_core.sql` a second time prints the guard message and changes nothing.

- [ ] **Step 6: Update the spec and roadmap**

- Spec 5.2 "Other tables": `tb_assy_login`, `tb_assy_api_log`, mock tables are created by `create_assy_core.sql` (M4), with their columns.
- Spec 5.3: M1, M2, M3. Replace the line "`backend/scripts/setup_dev_database.sql` gets the same tables + seed".
- Roadmap O1 → `[x]` with the decision.

- [ ] **Step 7: Hand off for review**

Show the up and down SQL in full in chat. You run, in this order: Step 5 runbook steps 1–3. Send back: the output of the verify queries (counts, the 4 seed rows, the two expected error numbers). Mark B1.1 `[x]` only after that.

---

### Task B1.2a: `getConstraintConflict` + master repository / service for processes

**Files:**
- Modify: `backend/shared/sqlErrors.js`
- Create: `backend/modules/master/repository.js`, `backend/modules/master/service.js`
- Test: `backend/test/unit/shared/sqlErrors.test.js`, `backend/test/unit/modules/master/service.test.js`

**Interfaces:**
- Consumes: `isUniqueViolation(err)`, `getUniqueViolationName(err)` (`shared/sqlErrors.js:5`), `AppError` (`shared/AppError.js:1`), constraint names from B1.1.
- Produces:
  - `getConstraintConflict(err): { kind: 'FOREIGN KEY' | 'REFERENCE' | 'CHECK', name: string } | null` — `err.number === 547` and the message matches `conflicted with the (FOREIGN KEY|REFERENCE|CHECK) constraint "<name>"`.
  - Repository (every function takes `db` first; returns plain rows):
    - `selectProcesses(db) → Promise<Process[]>` ordered by `process_code`
    - `insertProcess(db, { process_code, process_name, can_clear_tag }) → Promise<Process>` (`OUTPUT INSERTED.*`)
    - `updateProcess(db, id, { process_code, process_name, can_clear_tag }) → Promise<Process | null>` (`null` when no row)
    - `deleteProcess(db, id) → Promise<number>` (rows affected)
    - `Process = { id, process_code, process_name, can_clear_tag }`
  - Service: `createMasterService({ repo, db })` returns `{ listProcesses(), createProcess(input), updateProcess(id, input), deleteProcess(id) }`.
  - `toMasterError(err, uniqueFields)` inside `service.js` (not exported): unique violation → `AppError('MASTER_DUPLICATE', 409, ..., [{ in: 'body', path: uniqueFields[name], message }])`; `FOREIGN KEY` → `MASTER_INVALID_REF` 422; `REFERENCE` → `MASTER_IN_USE` 409; anything else → rethrown unchanged. `details` uses the same item shape as `validate()` (`shared/validate.js:19`).

- [ ] **Step 1: Write the failing tests**

`sqlErrors.test.js` — add:

```js
const fk = Object.assign(new Error('The INSERT statement conflicted with the FOREIGN KEY constraint "FK_master_location_process". The conflict occurred in database "db", table "dbo.tb_master_process", column \'id\'.'), { number: 547 });
const ref = Object.assign(new Error('The DELETE statement conflicted with the REFERENCE constraint "FK_master_location_process". The conflict occurred in database "db", table "dbo.tb_master_location", column \'process_id\'.'), { number: 547 });
// getConstraintConflict(fk)  → { kind: 'FOREIGN KEY', name: 'FK_master_location_process' }
// getConstraintConflict(ref) → { kind: 'REFERENCE',   name: 'FK_master_location_process' }
// getConstraintConflict({ number: 2627, message: '...' }) → null
// getConstraintConflict(new Error('x')) → null
```

`service.test.js` (fake repo = object with the repository functions; record calls):
- `listProcesses` returns the repo rows unchanged.
- `createProcess` passes `{ process_code, process_name, can_clear_tag }` to `repo.insertProcess` and returns its row.
- `createProcess` with repo throwing `{ number: 2627, message: "Violation of UNIQUE KEY constraint 'UQ_master_process_code'. ..." }` → rejects with `code === 'MASTER_DUPLICATE'`, `httpStatus === 409`, `details[0].path === 'process_code'`.
- `updateProcess` with `repo.updateProcess` resolving `null` → `MASTER_NOT_FOUND` 404.
- `deleteProcess` with repo resolving `0` → `MASTER_NOT_FOUND` 404; resolving `1` → resolves `undefined`.
- `deleteProcess` with repo throwing the `ref` error above → `MASTER_IN_USE` 409 (Review Focus 2).
- `createProcess` with repo throwing `new Error('boom')` → rejects with that same error (not wrapped).

- [ ] **Step 2: Run to verify they fail**

Run in `backend/`: `node --test test/unit/shared/sqlErrors.test.js test/unit/modules/master/service.test.js`
Expected: FAIL (`getConstraintConflict is not a function`, `Cannot find module '../../../../modules/master/service'`).

- [ ] **Step 3: Implement `getConstraintConflict`, the repository functions, `createMasterService` and `toMasterError`**

Process uniques: `{ UQ_master_process_code: 'process_code' }`. Messages: `Process code already exists`, `Process ${id} not found`, `Process is still used by a location`.

- [ ] **Step 4: Run the tests**

Run: `node --test test/unit/shared/sqlErrors.test.js test/unit/modules/master/service.test.js`, then `npm test`.
Expected: all PASS; total = 54 + new.

- [ ] **Step 5: Hand off for review** (diff + suggested commit message `feat(master): add process repository and service with SQL error mapping`).

---

### Task B1.2b: Processes HTTP, wiring, Bruno, delete old `/process`

**Files:**
- Create: `backend/modules/master/schemas.js`, `controller.js`, `routes.js`, `index.js`
- Modify: `backend/server.js`, `backend/routes/assembly.js` (delete `:315-336` and the process imports in `:9-12`)
- Create: `bruno/AYT-RFID/master/Processes - List.yml`, `- Create.yml`, `- Update.yml`, `- Delete.yml`
- Delete: `bruno/AYT-RFID/Process - {Create,Delete,List,Update}.yml`
- Modify: spec 7.8 (M5 endpoint table), spec 9 (M6 codes)
- Test: `backend/test/unit/modules/master/routes.test.js`

**Interfaces:**
- Consumes: `createMasterService` (B1.2a), `validate` (`shared/validate.js:7`), `createApp` (`app.js:6`), `startApp` (`test/helpers/startApp.js:4`).
- Produces:
  - `schemas.js`: `idParams` (`{ id: z.coerce.number().int().positive() }`), `processBody` (`process_code` trim 1–10, `process_name` trim 1–50, `can_clear_tag` boolean default `false`).
  - `createMasterController({ service })` → handlers `listProcesses`, `createProcess`, `updateProcess`, `deleteProcess`. Each reads `req.valid`, calls the service, sends 200 / 201 / 204.
  - `createMasterRoutes({ controller }) → express.Router` with:

| Method | Path | Validate | Success |
| --- | --- | --- | --- |
| GET | `/processes` | — | 200 `Process[]` |
| POST | `/processes` | body `processBody` | 201 `Process` |
| PUT | `/processes/:id` | params `idParams`, body `processBody` | 200 `Process` |
| DELETE | `/processes/:id` | params `idParams` | 204 |

  - `createMasterModule({ db }) → express.Router` in `index.js`: `createMasterRoutes({ controller: createMasterController({ service: createMasterService({ repo: require('./repository'), db }) }) })`.
  - `server.js`: `const apiRouter = express.Router(); apiRouter.use(createMasterModule({ db })); apiRouter.use(assemblyRoutes);` then `createApp({ apiRouter })`.

- [ ] **Step 1: Write the failing test `routes.test.js`**

Set-up: fake service (records calls, returns canned rows or throws `AppError`), `createApp({ apiRouter: createMasterRoutes({ controller: createMasterController({ service }) }), logger })`, `startApp`. Tests:
- `GET /api/assembly/processes` → 200, body = fake rows.
- `POST` with `{ "process_code": " 1600 ", "process_name": "ASSY" }` → 201; service got `{ process_code: '1600', process_name: 'ASSY', can_clear_tag: false }`.
- `POST` with `{}` → 400 `VALIDATION_ERROR`, `details` has paths `process_code`, `process_name`; service not called.
- `PUT /processes/abc`, `/processes/0`, `/processes/1.5` → 400 `VALIDATION_ERROR` (Review Focus 4).
- `PUT /processes/7` valid body → 200; service got `(7, {...})` with `7` a number.
- `DELETE /processes/7` → 204, empty body.
- Service throws `AppError('MASTER_IN_USE', 409, 'x')` on delete → 409 `{ error: 'MASTER_IN_USE', message: 'x' }`.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test test/unit/modules/master/routes.test.js`
Expected: FAIL (`Cannot find module '../../../../modules/master/routes'`).

- [ ] **Step 3: Write `schemas.js`, `controller.js`, `routes.js`, `index.js`; wire `server.js`**

- [ ] **Step 4: Delete the old `/process` handlers and their imports in `routes/assembly.js`**

- [ ] **Step 5: Run the tests**

Run: `node --test test/unit/modules/master/routes.test.js`, then `npm test`.
Expected: all PASS.

- [ ] **Step 6: Bruno — 4 new requests in `bruno/AYT-RFID/master/`, delete the 4 old `Process - *.yml`** (`bruno-docs` skill). Docs list every error code each endpoint can return, with an example body. Fake data only.

- [ ] **Step 7: Spec — 7.8 endpoint table (all three resources, M5), section 9 rows for M6**

- [ ] **Step 8: Hand off for review**

You run (dev DB, schema from B1.1): `node server.js` in `backend/`, then the 4 Bruno requests in order List → Create → Update → Delete, plus Delete on process `1500` (expect 409 `MASTER_IN_USE`, it has locations). Send back: status code + body of each.

---

### Task B1.3: Locations

**Files:**
- Modify: `backend/modules/master/{repository,service,schemas,controller,routes}.js`
- Create: `bruno/AYT-RFID/master/Locations - List.yml`, `- Create.yml`, `- Update.yml`
- Test: `service.test.js`, `routes.test.js` (add cases)

**Interfaces:**
- Produces:
  - `Location = { id, location_code, location_name, process_id, is_active, created_at }`; list rows add `process_code`, `process_name` (JOIN), ordered by `location_code`.
  - Repository: `selectLocations(db)`, `insertLocation(db, input) → Location`, `updateLocation(db, id, input) → Location | null`.
  - Service: `listLocations()`, `createLocation(input)`, `updateLocation(id, input)`. Uniques `{ UQ_master_location_code: 'location_code' }`. FK `FK_master_location_process` → `MASTER_INVALID_REF` with `details[0].path = 'process_id'`.
  - `locationBody`: `location_code` trim 1–20 (case kept), `location_name` trim 1–100, `process_id` positive int, `is_active` boolean default `true`.
  - Routes: `GET /locations` 200, `POST /locations` 201, `PUT /locations/:id` 200. **No DELETE** (deactivate with `is_active: false`).

- [ ] **Step 1: Failing tests**

Service: create maps `UQ_master_location_code` → `MASTER_DUPLICATE` path `location_code`; create with FK error on `FK_master_location_process` → `MASTER_INVALID_REF` 422 path `process_id`; update `null` → `MASTER_NOT_FOUND`.
Routes: `POST /locations` with `" GR_F2 "` → service got `location_code: 'GR_F2'` (trimmed, case kept); missing `process_id` → 400; `DELETE /locations/1` → 404 `ROUTE_NOT_FOUND`.

- [ ] **Step 2: Run to verify they fail** — `node --test test/unit/modules/master/`; expected FAIL on the new cases only.

- [ ] **Step 3: Implement** in the five module files.

- [ ] **Step 4: Run** `node --test test/unit/modules/master/`, then `npm test`. Expected: all PASS.

- [ ] **Step 5: Bruno — 3 requests** (`bruno-docs` skill). The Update doc shows deactivation (`is_active: false`).

- [ ] **Step 6: Hand off for review** — you run the 3 Bruno requests plus Create with `process_id: 999` (expect 422 `MASTER_INVALID_REF`). Send back status + body.

---

### Task B1.4a: Statuses

**Files:**
- Modify: `backend/modules/master/{repository,service,schemas,controller,routes}.js`, `backend/routes/assembly.js` (delete `:294-313` and the status imports)
- Create: `bruno/AYT-RFID/master/Statuses - List.yml`, `- Create.yml`, `- Update.yml`, `- Delete.yml`
- Delete: `bruno/AYT-RFID/Status - {Create,Delete,List,Update}.yml`
- Modify: spec 7.8 (M7), spec 5.2 status table (M8 code format)
- Test: `service.test.js`, `routes.test.js`, create `schemas.test.js`

**Interfaces:**
- Produces:
  - `SYSTEM_STATUS_CODES = ['REGISTERED', 'CLEARED']` (exported from `service.js`; B2–B4 refer to statuses by these codes).
  - `Status = { id, status_code, status_label, seq, location_id }`; list rows add `location_code`, `location_name`, `process_id`, `process_code` (LEFT JOIN location → process) and `is_system` (computed in the service), ordered by `seq, id`.
  - Repository: `selectStatuses(db)`, `selectStatusById(db, id) → Status | null`, `insertStatus(db, input)`, `updateStatus(db, id, input) → Status | null`, `deleteStatus(db, id) → number`.
  - Service: `listStatuses()`, `createStatus(input)`, `updateStatus(id, input)`, `deleteStatus(id)`.
    - Uniques: `{ UQ_master_assy_status_code: 'status_code', UX_master_assy_status_location: 'location_id' }`. FK `FK_master_assy_status_location` → `MASTER_INVALID_REF` path `location_id`. `REFERENCE` on delete (lot or event uses it) → `MASTER_IN_USE`.
    - `updateStatus`: load by id (`null` → 404); if the current code is a system code and `input.status_code !== current.status_code` → `MASTER_IN_USE` 409 `System status <code> cannot change its code`.
    - `deleteStatus`: load by id (`null` → 404); system code → `MASTER_IN_USE` 409 `System status <code> cannot be deleted`.
  - `statusBody`: `status_code` trim → upper-case → 1–30 chars → `^[A-Z0-9_]+$` (M8); `status_label` trim 1–50; `seq` int ≥ 0; `location_id` positive int or `null`. `superRefine` (M7): `status_code === 'CLEARED'` needs `location_id === null`, path `location_id`, message `CLEARED must have no location`; any other code needs a `location_id`, path `location_id`, message `An active status needs a location`.
  - Routes: `GET /statuses` 200, `POST /statuses` 201, `PUT /statuses/:id` 200, `DELETE /statuses/:id` 204.

- [ ] **Step 1: Failing tests**

`schemas.test.js`:
- `{ status_code: ' cleared ', status_label: 'Cleared', seq: 5, location_id: null }` → success, `status_code === 'CLEARED'` (Review Focus 1).
- `{ status_code: 'CLEARED', ..., location_id: 3 }` → fail, issue path `['location_id']`.
- `{ status_code: 'GR_F2', ..., location_id: null }` → fail, path `['location_id']`.
- `{ status_code: 'GR F2', ... }` → fail, path `['status_code']`.

`service.test.js`:
- `listStatuses` adds `is_system: true` to `REGISTERED` / `CLEARED` rows, `false` to others.
- `updateStatus` on current `REGISTERED` with input code `REGISTERED`, new label → calls `repo.updateStatus` (Review Focus 5).
- `updateStatus` on current `REGISTERED` with input code `REG2` → `MASTER_IN_USE`, repo update not called.
- `deleteStatus` on `CLEARED` → `MASTER_IN_USE`, repo delete not called.
- `deleteStatus` on `GR_F1` with repo throwing a 547 REFERENCE error on `FK_assy_lot_status` → `MASTER_IN_USE`.
- `createStatus` with repo throwing 2601 on `UX_master_assy_status_location` → `MASTER_DUPLICATE`, `details[0].path === 'location_id'` (Review Focus 3).
- `updateStatus` / `deleteStatus` with `selectStatusById` → `null` → `MASTER_NOT_FOUND`.

`routes.test.js`: `POST /statuses` with `CLEARED` + `location_id: 3` → 400 `VALIDATION_ERROR`, service not called; `DELETE /statuses/4` → 204.

- [ ] **Step 2: Run to verify they fail** — `node --test test/unit/modules/master/`; expected FAIL on the new cases only.

- [ ] **Step 3: Implement** in the five module files.

- [ ] **Step 4: Delete the old `/status` handlers and the `masterService` import in `routes/assembly.js`.** After this, nothing imports `services/masterService.js`.

- [ ] **Step 5: Run** `node --test test/unit/modules/master/`, then `npm test`. Expected: all PASS.

- [ ] **Step 6: Bruno — 4 requests in `master/`, delete the 4 old `Status - *.yml`** (`bruno-docs` skill).

- [ ] **Step 7: Spec — 7.8 (M7), 5.2 status code format (M8)**

- [ ] **Step 8: Hand off for review** — you run: List; Create `GR_F2` on a new location from B1.3; Create a second status on `gr_f1` (expect 409 `MASTER_DUPLICATE`); Update `REGISTERED` label only (expect 200); Update `REGISTERED` code (expect 409); Delete `CLEARED` (expect 409); Delete `GR_F2` (expect 204). Send back status + body.

---

### Task B1.4b: Delete the old master code

**Files:**
- Delete: `backend/services/masterService.js`, `backend/test/unit/masterService.test.js`
- Delete: `backend/sql/dbo.Stored_tb_master_assy_status_{delete,insert,select,update}.StoredProcedure.sql`, `dbo.Stored_tb_master_process_{delete,insert,select,update}.StoredProcedure.sql`
- Modify: roadmap (B1.4b row only; B1 closes in B1.5)

- [ ] **Step 1: Confirm nothing imports them** — Grep `masterService` and `Stored_tb_master_` under `backend/` (excluding the files being deleted). Expected: no hits.

- [ ] **Step 2: Delete the 10 files.**

- [ ] **Step 3: Run** `npm test` in `backend/`. Expected: all PASS; the count drops by the number of tests in `masterService.test.js`.

- [ ] **Step 4: Update the roadmap** — B1.4b row `[x]`.

- [ ] **Step 5: Hand off for review** (suggested commit: `chore(master): remove old master service and stored procedures`).

---

### Task B1.5: Merge `database.js` into `db.js`

**Why:** Two files share one concern (DB access). `database.js` only exists because legacy code calls `getPool()` directly. One file gives one import path and makes "use `query` / `transaction`" the obvious choice.

**Scope note:** B1 does **not** remove every `getPool()` caller. `routes/assembly.js` still uses it in the lot, tag, dashboard and clear-tag handlers (rewritten in later branches), and so does `scripts/rehash_passwords.js`. So `db.js` keeps exporting `getPool` for now. It is a legacy export: no new code uses it (Global Constraints). Drop it when the last caller is gone.

**Files:**
- Modify: `backend/db.js` — move in `dbConfig`, `createPoolGetter` and the `getPool` instance; remove the `require('./database')` line and the `//?` comment at `db.js:3`
- Modify: `backend/test/unit/db.test.js` — add the 3 tests from `database.test.js`, importing `createPoolGetter` from `../../db`
- Modify: `backend/routes/assembly.js:4`, `backend/scripts/rehash_passwords.js:6` — `require('../database')` → `require('../db')`
- Delete: `backend/database.js`, `backend/test/unit/database.test.js`
- Modify: this plan, M1 row (`database.js:6` → the new `db.js` line); roadmap

**Produces:** `db.js` exports `{ query, transaction, typed, inferSqlType, sql, getPool, createPoolGetter }`. `inferSqlType` and `createPoolGetter` stay exported only for their tests.

- [ ] **Step 1: Move the tests first** — copy the 3 pool tests and `fakePoolClass` into `db.test.js`, import from `../../db`. Delete `database.test.js`.

- [ ] **Step 2: Run to verify they fail** — `node --test test/unit/db.test.js` in `backend/`. Expected: FAIL, `createPoolGetter is not a function`.

- [ ] **Step 3: Merge** `database.js` into `db.js` (no behavior change). Delete `database.js`. Put this comment on the `getPool` entry in `module.exports`:

```js
// Legacy: only routes/assembly.js and scripts/rehash_passwords.js use this.
// New code uses query/transaction. Remove when they are gone.
```

- [ ] **Step 4: Switch the two legacy imports** (`routes/assembly.js:4`, `scripts/rehash_passwords.js:6`).

- [ ] **Step 5: Confirm nothing imports `database`** — Grep `require\(['"][./]+database['"]\)` under `backend/`, excluding `node_modules`. Expected: no hits.

- [ ] **Step 6: Run** `npm test` in `backend/`. Expected: all PASS, same test count as before (3 tests moved, none lost).

- [ ] **Step 7: Update the roadmap** — B1.5 row `[x]`. Add a follow-up row: "drop the `getPool` export from `db.js` when the last legacy caller is rewritten".

- [ ] **Step 8: Hand off for review** (suggested commit: `refactor(backend): merge database.js into db.js`).

---

### Task B1.6: Backend conventions doc

**Why:** The backend has no written pattern. New code (`modules/master/`) and legacy code (`routes/assembly.js`, `services/*.js`) sit side by side, and a reader cannot tell which one to copy. Claude loads `CLAUDE.md` on its own but not `README.md`, so `CLAUDE.md` imports the README: one source, read by both.

**Runs last in B1:** it describes what B1.2–B1.5 really built, not a guess.

**Files:**
- Create: `backend/README.md` (about 40–60 lines)
- Create: `backend/CLAUDE.md` — only `@README.md`
- Modify: `overview_diagram/README.md` — banner at the top only, no other change
- Modify: roadmap

- [ ] **Step 1: Read the real tree** — `ls` of `backend/` and `backend/modules/master/`, `backend/shared/`, `backend/test/`. Every rule in the README must match a file that exists.

- [ ] **Step 2: Write `backend/README.md`** with these sections, short lists and tables only:

| Section | Content |
| --- | --- |
| Run | `npm install`, `npm test`; link `docs/runbooks/dev-database-setup.md`; env names from `.env.example` (no values) |
| Folder map | One line per folder: `app.js` / `server.js`, `db.js`, `modules/<name>/`, `shared/`, `routes/` (legacy), `services/` (legacy), `scripts/`, `sql/`, `test/unit/`, `test/helpers/` |
| Module layout | `modules/<name>/{routes,controller,service,repository,schemas,index}.js`: one-line duty each, and who may import whom (routes → controller → service → repository → `db.js`) |
| Naming | camelCase files; PascalCase only for a file that exports a class (`AppError.js`); factories are `createXxx({ deps })`; tests mirror the source path as `<file>.test.js` |
| Rules | New code imports only `db.js` (`query`, `transaction`, `typed`), never `getPool`; errors are `AppError` with a code from spec section 9; input is checked by zod in `validate`; every endpoint has a Bruno request |
| Legacy | `routes/assembly.js`, `services/*.js`, `getPool`: do not copy, they get rewritten in later branches (roadmap) |
| Links | Spec, roadmap, Bruno collection path |

- [ ] **Step 3: Write `backend/CLAUDE.md`** with the single line `@README.md`.

- [ ] **Step 4: Stale banner on `overview_diagram/README.md`** — add at the top: `> **Out of date.** Written before the 2026-10-01 backend redesign. For the backend, see backend/README.md and the redesign spec.` with both links.

- [ ] **Step 5: Update the roadmap** — B1.6 and B1 status `[x]`. Add a row for the deferred backend ESLint setup (B1.6-lint). List all `DEFERRED` / `BLOCKED` items.

- [ ] **Step 6: Hand off for review** (suggested commit: `docs(backend): add backend README with structure and naming conventions`).
