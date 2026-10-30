# Integration tests

## Purpose
Run the repository integration tests against a real dev database. They pin what the master repositories (`processes`, `locations`, `statuses`) return and which SQL errors they raise, so a rewrite (Sequelize, plan `2026-10-27-b1x-structure-envelope-orm.md`, Tasks 6–7) can be checked against them.
Do not use it to check the HTTP layer: use `npm test` (unit) and Bruno for that.

## Prerequisites
- Node 22 and `npm install` done in `backend/`.
- The dev database exists and has the schema and seed: `docs/runbooks/dev-database-setup.md`.
- `backend/.env` exists. Environment variables (names only): `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`.
- `DB_NAME` points at `db_rfid_assembly_dev`.
- Allowed environment: dev database only. The tests refuse to connect when `DB_NAME` does not end with `_dev`.

## Command
Folder: `backend/`

    npm run test:integration

## What it does
| Item | Behavior |
|---|---|
| Files | `backend/test/integration/**/*.test.js` (`npm test` does not run them) |
| Env | Read from `backend/.env` (`node --env-file=.env`). A missing `.env` stops the run |
| Writes | Each test runs in one transaction (`test/helpers/withRollback.js`) that is always rolled back. Nothing is saved |
| Fixtures | Each test inserts its own rows (codes `ZZIT1`, `zz_it_1`, `ZZ_IT_1`, ...). No test relies on seed ids |
| Exit | `--test-force-exit` ends the run when the tests finish, so the open DB pool does not keep it waiting |

## Expected output
- Pass: the summary ends with `# fail 0`.
- Fail, `DB_NAME must end with _dev`: fix `DB_NAME` in `backend/.env`. Nothing connected.
- Fail, login or connect error: check the `DB_*` values and that the SQL Server instance is running.
- Fail, an assertion: the repository behavior differs from what the test pins. Send it back; do not edit the test.

## Stop and clean up
Nothing to clean up. Every write is rolled back.
If a run is killed mid-test, SQL Server rolls back the open transaction when the connection drops.

## Who runs it
User runs it (real database). Claude never runs it.
Send back: the summary lines (`# tests`, `# pass`, `# fail`) and, for each failing test, its name and the assertion message only. Remove server names if they appear.
