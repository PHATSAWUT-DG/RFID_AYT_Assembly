# Backend Service Layer Refactor — Implementation Plan

> **For Claude:** Use `@skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Move business logic out of SQL Server stored procedures and out of the Express router into a testable `backend/services/` layer of plain JavaScript functions — fixing the defects found along the way rather than preserving them.

**Architecture:** Three layers — routes parse HTTP and shape responses, services own business logic and transactions, a thin `db.js` seam owns connection and parameter mechanics. Services receive their database dependency by injection so they can be unit-tested against a fake. Stored procedures are retired incrementally, lowest-risk group first; the state-transition SPs move last and only inside explicit transactions.

**Tech Stack:** Node.js 18+, Express 5, `mssql`/`msnodesqlv8` (Windows Auth), `node:test` + `node:assert` (built-in), `bcryptjs`.

**Status:** This is a development-stage system. Defects found during analysis are fixed, not preserved. See the Decisions Log.

> **Review 2026-10-14 — read this first.**
>
> - **Tasks 1–9 are done** (commits `ca7b743` … `544f90b`). Status per task is in [Task status](#task-status-reviewed-2026-10-14).
> - **Tasks 10–22 are superseded** by the backend redesign: spec `docs/superpowers/specs/2026-10-01-backend-redesign-design.md`, roadmap `docs/superpowers/plans/2026-10-01-backend-redesign-roadmap.md`. The old tables and SPs are already dropped from the dev DB, so those tasks have nothing left to port. Keep them as the record of *why* (D3–D11, FLAG-1, FLAG-2) — the redesign must not lose those fixes.
> - **The frontend changed after this plan was written.** It is TypeScript now (`.tsx`), has a typed API contract (`frontend/src/types/api.ts`), a mock mode (`frontend/src/mocks/`), and new features (`can_clear_tag`, daily inventory, process breakdown). Every `.js` page path below now means the `.tsx` file. See [Frontend impact — Assembly pages](#frontend-impact--assembly-pages-reviewed-2026-10-14).
> - **Line numbers in `backend/routes/assembly.js` are pre-Task-4** (557 lines then, 417 now). Find a route by its path, not its line.

---

## Context an engineer needs before starting

### The system

RFID Assembly tracking at NHT Bearing. Bearing lots are bound to RFID tags and move through four states. Two RFID readers on a conveyor trigger transitions automatically via a Python service; a dashboard shows live status; an admin can override.

```
status_id=1 bf_issue → status_id=2 gr_f1 → status_id=3 mc_f1 → status_id=4 completed
[Register UI]         [Reader 1 auto]      [Reader 2 auto]     [AS400 poll / admin]
```

Order is enforced inside the stored procedures today. That enforcement is the system's only integrity guard and **must survive this refactor** — it moves into `processService`, it does not disappear.

### Who calls the backend

1. **React frontend** — `frontend/src/`, talks to `http://{server}:5001/api/assembly`. **It also calls the reader endpoints**: [ScanTag.tsx:42](../../frontend/src/pages/Assembly/ScanTag.tsx#L42) POSTs to `/gauging-room-f1` and `/mc-gauging-f1` (paths in [scanConfig.ts:5-6](../../frontend/src/config/scanConfig.ts#L5-L6)) as a manual scan screen. Any change to those codes must update ScanTag too (added 2026-10-14).
2. **Python reader service** — `service/main_assy.py`, POSTs to `/gauging-room-f1` and `/mc-gauging-f1`. Runs as a Windows startup script on a 32-bit Python install on the OT network. **Its contract is frozen** — it is the one client that cannot be redeployed alongside the backend.
3. **The backend's own polling loop** — [server.js:15-63](../../backend/server.js#L15-L63). Simulation code only; see D1.

### The tag-pairing requirement

Stated by the user, and the reason `tb_assy_tag` exists:

> A tag is reused. One tag pairs with only one lot at a time. To reuse a tag, its lot must be cleared first; the tag then becomes inactive and is free to pair with a new lot.

So `tb_assy_tag` is the **pairing registry**, and the invariant is:

> **At most one row with `status = 'active'` per `tag_id`.**

Today nothing enforces this — not the schema, not the SPs. Task 14 makes it a database constraint. Everything in Phase 5 depends on it.

### Current state of the code

- [backend/routes/assembly.js](../../backend/routes/assembly.js) — 557 lines, every route, no service layer.
- [backend/database.js](../../backend/database.js) — exports `{ sql, poolPromise }`. Hardcoded server `PBSY70\SQLEXPRESS`, Windows Auth.
- [backend/server.js](../../backend/server.js) — Express bootstrap + polling simulation.
- `backend/backup_DB_SP/` — 30 SP scripts + 9 table scripts, UTF-16, dated 2026-09-01.
- No tests. `package.json` `test` script is the npm placeholder that exits 1.

### The 30 stored procedures

**Dead — delete, do not port (3):**
`Stored_tb_assy_in_assy` and `Stored_tb_assy_wip_gauging` are commented out at [assembly.js:201](../../backend/routes/assembly.js#L201) and [assembly.js:214](../../backend/routes/assembly.js#L214). `Stored_tb_assy_mock_as400_select` has no caller anywhere.

**Live (27), by target module:**

| Target module | SPs | Phase |
|---|---|---|
| `apiLogService.js` | `api_log_insert` | 1 |
| `mockService.js` | `mock_done_{select,insert,delete}` | 1 |
| `masterService.js` | `master_assy_status_{select,insert,update,delete}`, `master_process_{select,insert,update,delete}` | 2 |
| `userService.js` | `login_verify`, `login_{select,insert,update,delete}` | 2 |
| `dashboardService.js` | `dashboard`, `dashboard_history`, `dashboard_process_summary`, `clear_tag_history` | 4 |
| `lotService.js` | `lot_by_tag`, `register` | 5 |
| `processService.js` | `gauging_room_f1`, `mc_gauging_f1`, `completed`, `change_process` | 5 |

### Schema facts that matter

- `tb_assy_lot.lot_no` — **already UNIQUE** (`UQ__tb_assy___38CAC255`). Rely on it.
- `tb_assy_wos.wos` — **already UNIQUE**.
- `tb_assy_lot.status_id` — FK to `tb_master_assy_status.id`. Nullable.
- `tb_assy_lot.tag_id` — **nullable**. A lot can exist with no tag.
- `tb_assy_tag` has a column named **`status`** (`VARCHAR(20)`, default `'active'`), not `status_id`.
- `tb_assy_log.event_type` is `VARCHAR(50)`; `remark` is `VARCHAR(255)`.
- `tb_assy_lot.updated_at` / `created_at` default `GETDATE()`.

---

## Decisions Log

Findings from analysis, with the decision taken for each. **These are fixes, not preservations** — this is a development-stage system and the user has confirmed changes are welcome.

| # | Finding | Decision | Task |
|---|---|---|---|
| D1 | Polling loop bypasses process order and hand-rolls its own completion SQL | **Out of scope.** It is simulation code checking `tb_assy_mock_done`; the user will replace it with the real AS400 API check. Left alone except D2. | — |
| D2 | Polling writes `tb_assy_tag SET status_id = ...` — no such column. Throws every cycle, silently caught | **Fix the column name.** One-word change. Without it the simulation silently does nothing, and Task 14's backfill can't be reasoned about | 2 |
| D3 | `register` has a TOCTOU gap: `IF EXISTS` then `INSERT`, no transaction | **Fix.** Wrap in a transaction with `UPDLOCK, HOLDLOCK`, and catch duplicate-key as a backstop | 16 |
| D4 | `TAG_IN_USE` checks `tb_assy_lot.tag_id`, never `tb_assy_tag.status` — the two can disagree | **`tb_assy_tag` becomes the authority for tag pairing**, enforced by a filtered unique index. `TAG_IN_USE` checks it | 14, 16 |
| D5 | `Stored_tb_assy_dashboard`'s three recordsets filter inconsistently | **Unify.** Same WHERE across recordsets, `status_id != 4` in WHERE where it belongs | 13 |
| D6 | Same SP: RS1 `total_qty` sums qty, RS2 `total_qty` counts lots | **Delete recordset 2.** No page reads it — [Dashboard.tsx:105](../../frontend/src/pages/Assembly/Dashboard.tsx#L105) builds its part list from `history`. The type and mock still carry it; see Task 13 | 13 |
| D7 | Reader config paths are CWD-relative, so the server only runs from `backend/` | **Fix.** `path.join(__dirname, ...)`, extracted to a service | 19 |
| D8 | Plaintext passwords | **Fix.** `bcryptjs` + a one-off rehash script | 9 |
| D9 | CRUD endpoints return `200 {result: '<raw SQL error text>'}` | **Fix.** Real HTTP status codes for the CRUD family, with coordinated frontend changes | 10 |
| D10 | The Python service branches on `INVALID_PROCESS_ORDER` ([main_assy.py:77](../../service/main_assy.py#L77)) but the SPs return `INVALID_PROCESS` — the branch is dead, and the wrong-order case logs `WARNING` instead of skipping silently | **Fix on the backend side.** Return `INVALID_PROCESS_ORDER`, matching the frozen client and README §1 | 17 |
| D11 | Python drops a scan permanently if the backend is unreachable — no retry, and the cooldown is set before the POST | **Out of scope** (touches the frozen client). Drives the cutover rule instead: restart the backend only while the line is stopped | Cutover |

### Two flags carried forward

**FLAG-1 (Task 13): the dashboard numbers will change, and nobody has confirmed what they should be.** Unifying the filters is defensible on its own, but "what should the four summary cards actually count?" is a product question. Recap with the user once they can see the corrected numbers.

**FLAG-2 (Task 18): `CLEAR_FAILED` is logged for admin-initiated clears only.** Automated sources retry the same lot every cycle; logging those writes thousands of rows a day per stuck lot. Revisit if the audit trail turns out to need them.

---

## The contract boundary

This is the single most important thing to get right. Two families of endpoint, two different error conventions, and they must not be mixed up.

### Frozen — `200 OK` with `{ result: '<CODE>' }`

Business outcomes are values, not status codes. The Python service and the operator screens depend on this.

| Endpoint | Codes |
|---|---|
| `POST /register-tag` | `OK`, `LOT_ALREADY_EXISTS`, `TAG_IN_USE`, `INVALID_STATUS` |
| `POST /gauging-room-f1` | `OK`, `TAG_NOT_FOUND`, `INVALID_PROCESS_ORDER` (renamed in Task 17, D10), `INVALID_STATUS` |
| `POST /mc-gauging-f1` | `OK`, `TAG_NOT_FOUND`, `INVALID_PROCESS_ORDER` (renamed in Task 17, D10), `INVALID_STATUS` |
| `POST /change-process` | `OK`, `TAG_NOT_FOUND`, `INVALID_STATUS`, `ALREADY_COMPLETED`, `SAME_STATUS` |
| `POST /completed` | `OK`, `LOT_NOT_FOUND`, `INVALID_PROCESS`, `INVALID_STATUS` |

> **2026-10-14:** `INVALID_PROCESS` on `/completed` no longer means "status ≠ 3". Since `alter_process_can_clear_tag.sql` (commit `e6cfbce`) it means "the lot's status is 4, or its status belongs to a process with `can_clear_tag = 0`". The frontend types these codes in [types/api.ts:157-161](../../frontend/src/types/api.ts#L157-L161); a code change here is a change there and in `frontend/src/mocks/handlers/lots.ts`.

**Do not change these.** A `500` where the Python service expects `200 {result:'INVALID_PROCESS'}` turns a silent, correct skip into an error path nobody has written.

### Moving to HTTP status codes (Task 10)

`/login`, `/login/users*`, `/status*`, `/process*`, `/mock-done*` — admin CRUD, React-only, redeployed together with the backend.

### Already using status codes — unchanged

| Endpoint | Behaviour |
|---|---|
| `GET /lot/:lot_no` | 404 `{error:'LOT_NOT_FOUND'}` |
| `GET /lot-by-tag/:tag_id` | 404 `{error:'TAG_NOT_FOUND'}` |
| `GET /lot-by-lot/:lot_no` | 404 `{error:'LOT_NOT_FOUND'}` |
| `POST /login` | 401 `{error:'INVALID_CREDENTIALS'}` |

---

## Phases

| Phase | Tasks | Risk | Delivers |
|---|---|---|---|
| 0 | 1–2 | — | Test harness; D2 |
| 1 | 3–5 | Low | `db.js` seam, `apiLogService`, `mockService` |
| 2 | 6–8 | Low | `masterService`, `userService` — 13 SPs |
| 3 | 9–10 | Medium | D8 bcrypt, D9 HTTP error contract + frontend |
| 4 | 11–13 | Medium | `dashboardService`; D5, D6, FLAG-1 |
| 5 | 14–18 | **High** | Tag-pairing constraint, `lotService`, `processService`; D3, D4, FLAG-2 |
| 6 | 19–22 | — | D7, indexes, drop SPs, follow-ups |

Stop at any phase boundary. Each leaves the system working.

### Task status (reviewed 2026-10-14)

| # | Task | Status |
|---|---|---|
| 1 | Test harness + dev DB | [x] `backend/test/helpers/fakeDb.js`, env-driven `backend/database.js`, `backend/scripts/setup_dev_database.sql` |
| 2 | D2 polling column | [x] `backend/server.js:44` writes `status = 'cleared'` |
| 3 | `db.js` seam | [x] `backend/db.js` |
| 4 | `apiLogService` | [x] `backend/services/apiLogService.js`, used in `routes/assembly.js:7` |
| 5 | `mockService` | [x] `backend/services/mockService.js`. FE gap: `MockDone.tsx:62-69` ignores `NOT_FOUND` — see FE finding F6 |
| 6 | `masterService` — status | [x] `backend/services/masterService.js` |
| 7 | `masterService` — process | [x] `masterService.js:36-56`, **but missing `can_clear_tag`** — see FE finding F1 |
| 8 | `userService` | [x] `backend/services/userService.js` |
| 9 | D8 bcrypt | [x] `userService.js:1`, `backend/scripts/rehash_passwords.js` |
| 10 | D9 HTTP codes for CRUD | [-] DEFERRED — superseded by redesign B0.2 (`AppError` + error handler) and B1. Resume: carry the FE notes in F3 into B7 |
| 11 | Dashboard baselines | [-] DEFERRED — superseded; old SPs dropped, nothing to baseline. Resume: none needed |
| 12 | `dashboardService` — history etc. | [-] DEFERRED — superseded by redesign B5.2 / B5.4. Resume: carry F2, F4 into B5 |
| 13 | Main dashboard (D5, D6, FLAG-1) | [-] DEFERRED — superseded by redesign B5.4. Resume: carry D5, D6, FLAG-1 and F5 into B5.4 |
| 14 | Tag-pairing constraint (D4) | [-] DEFERRED — superseded by redesign B1.1 / B2.3. Resume: check the new schema keeps "one active pairing per tag" as a DB constraint |
| 15 | Transition characterization tests | [-] DEFERRED — superseded; old SPs dropped |
| 16 | `lotService` (D3, D4) | [-] DEFERRED — superseded by redesign B2.4 / B2.5 |
| 17 | `processService` — transitions (D10) | [-] DEFERRED — superseded by redesign B3.2. Resume: D10 and F7 must hold for the new `POST /scans` |
| 18 | `processService` — clear (FLAG-2) | [-] DEFERRED — superseded by redesign B4.2. Resume: carry FLAG-2, `NO_TAG_PAIRED` and F8 into B4.2 |
| 19 | D7 reader config paths | [-] DEFERRED — not covered by redesign B0–B5 (reader routes stay, roadmap O2). Resume: still a live bug at `routes/assembly.js:228, 237, 393`; do it as a small task before the reader phase |
| 20 | Indexes | [-] DEFERRED — superseded; new schema in B1.1 defines its own indexes |
| 21 | Drop SPs | [-] DEFERRED — superseded; SPs already dropped from dev DB per redesign spec §1 |
| 22 | Docs | [-] DEFERRED — superseded; redesign updates docs per branch |

---

## Conventions for every task

**Service signature.** Dependencies first, data second:

```js
async function findActiveLotByTag(db, tagId) { ... }
```

`db` is the seam from Task 3 — never the raw `mssql` pool, never a module-level import. This is what makes unit tests possible without a database.

**Return shape.** Services return plain data and know nothing about `req`/`res`. Process-family services return `{ result: 'OK' | '<CODE>' }` mirroring the frozen contract. CRUD services return data and **throw** typed errors after Task 10.

**Errors.** Before Task 10, CRUD services return `{ result: err.message }`. After Task 10 they throw from `services/errors.js`. Process-family services always return codes; they throw only on genuine infrastructure failure.

**Routes keep explicit `try/catch`.** Express 5 is believed to forward rejected promises from async handlers to the error middleware, but this was not verified against current docs — do not rely on it. Every handler catches its own errors.

**Parameterisation.** Every user-supplied value goes through a bound parameter, `LIKE` patterns included — build `'%' + @param + '%'` inside the SQL string and bind the value. The system has no SQL injection today; do not introduce it.

**Running the app** — from `backend/`: `node server.js`. No watcher, no build step.

---

## Task 1: Set up the test harness and a development database

**Files:**
- Modify: `backend/package.json`, `backend/database.js`, `backend/.env`
- Create: `backend/.env.example`
- Create: `backend/test/helpers/fakeDb.js`
- Create: `backend/test/helpers/fakeDb.test.js`

No new dependencies — Node 18+ ships `node:test`.

**The database is currently hardcoded.** [database.js:4-5](../../backend/database.js#L4-L5) pins `server: 'PBSY70\\SQLEXPRESS'` and `database: 'db_rfid_assembly'`, so there is no way to point the backend at a second database. Phase 5's integration tests write data and cannot run against the only database that exists. Fix that here, before anything depends on it.

**Recommended setup:** a second database, `db_rfid_assembly_dev`, on the same SQLEXPRESS instance. Same Windows Auth, same machine, no new infrastructure — the only cost is disk. Restore or script the schema into it from `backup_DB_SP/`, seed the two master tables per README §8, and point `.env` at it during development.

**Step 1: Add the test scripts**

In `backend/package.json`, replace the `scripts` block:

```json
  "scripts": {
    "test": "node --test test/unit/ test/helpers/",
    "test:integration": "node --test test/integration/"
  },
```

Integration tests are gated on `RUN_DB_TESTS=1` inside the files themselves, not in the script, so the env var works the same on PowerShell and bash. To run them:

```powershell
$env:RUN_DB_TESTS=1; npm run test:integration
```

**Step 2: Make the connection env-driven**

Rewrite [backend/database.js](../../backend/database.js):

```js
const sql = require('mssql/msnodesqlv8');

const dbConfig = {
    server: process.env.DB_SERVER || 'PBSY70\\SQLEXPRESS',
    database: process.env.DB_NAME || 'db_rfid_assembly',
    driver: 'msnodesqlv8',
    options: { trustedConnection: true, trustServerCertificate: true },
};
```

Defaults preserve today's behaviour, so nothing breaks if `.env` is missing. Add to `backend/.env`:

```env
DB_SERVER=PBSY70\SQLEXPRESS
DB_NAME=db_rfid_assembly_dev
```

Create `backend/.env.example` with the same keys and no values — `.env` holds a machine-specific server name and should not be the only record of which variables exist.

> `server.js` calls `require('dotenv').config()` at [line 1](../../backend/server.js#L1), before any route is loaded, so `process.env` is populated by the time `database.js` is first required. Integration tests do not go through `server.js` — they must `require('dotenv').config()` themselves at the top of each file, or they will silently hit the default (production) database. **Get this wrong and Phase 5's write tests run against real data.** Task 11 and Task 15 both depend on it.

**Step 3: Create the development database**

```sql
CREATE DATABASE db_rfid_assembly_dev
```

Script the nine tables from `backend/backup_DB_SP/*.Table.sql` into it, then the SPs, then seed the master tables (README §8). Confirm:

```sql
USE db_rfid_assembly_dev;
SELECT COUNT(*) FROM tb_master_assy_status;  -- expect 4
SELECT COUNT(*) FROM tb_master_process;      -- expect 2
```

**Step 4: Write the failing test**

Create `backend/test/helpers/fakeDb.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { createFakeDb } = require('./fakeDb');

test('fakeDb returns the queued recordset and records the call', async () => {
    const db = createFakeDb([{ recordset: [{ lot_no: 'L1' }] }]);
    const out = await db.query('SELECT 1', { a: 1 });
    assert.deepStrictEqual(out.recordset, [{ lot_no: 'L1' }]);
    assert.strictEqual(db.calls.length, 1);
    assert.strictEqual(db.calls[0].sql, 'SELECT 1');
    assert.deepStrictEqual(db.calls[0].params, { a: 1 });
});

test('fakeDb throws when a query is made with no queued response', async () => {
    const db = createFakeDb([]);
    await assert.rejects(() => db.query('SELECT 1'), /no queued response/);
});

test('fakeDb transaction runs the callback and records calls', async () => {
    const db = createFakeDb([{ recordset: [] }]);
    const out = await db.transaction(async (tx) => {
        await tx.query('SELECT 1');
        return 'done';
    });
    assert.strictEqual(out, 'done');
    assert.strictEqual(db.calls.length, 1);
});
```

**Step 5: Run to verify it fails**

Run: `cd backend && node --test test/helpers/`
Expected: FAIL — `Cannot find module './fakeDb'`

**Step 6: Implement**

Create `backend/test/helpers/fakeDb.js`:

```js
// Test double for the db seam. Queue responses in call order; inspect `calls`
// afterwards to assert on the SQL and parameters a service produced.
function createFakeDb(responses = []) {
    const queue = [...responses];
    const calls = [];

    const query = async (sql, params = {}) => {
        calls.push({ sql, params });
        if (queue.length === 0) {
            throw new Error(`fakeDb: no queued response for query: ${sql}`);
        }
        return queue.shift();
    };

    // Transactions run the callback against the same fake so the service under
    // test exercises its real code path.
    return { calls, query, transaction: async (fn) => fn({ query }) };
}

module.exports = { createFakeDb };
```

**Step 7: Run to verify it passes**

Run: `cd backend && node --test test/helpers/`
Expected: PASS, 3 tests

**Step 8: Verify the app still runs against the dev database**

Start the server and hit any read endpoint. Then confirm you are on the right database:

```sql
SELECT DB_NAME()  -- run from a query the backend issues, or check SQL Server's active sessions
```

> Do not commit `backend/.env` — it holds a machine-specific server name. Confirm it is in `.gitignore`; if it is not, add it in this commit.

---

## Task 2: Fix D2 — polling writes a non-existent column

**Files:**
- Modify: `backend/server.js:41`

The polling loop is throwaway simulation code and the user will replace it with the real AS400 check (D1). But `tb_assy_tag` has no `status_id` column — the statement throws every cycle, is swallowed at [server.js:51](../../backend/server.js#L51), and so the tag is never cleared and the `COMPLETED` log insert on the next line never runs. Fix the column name so the simulation actually simulates, and so Task 14's data backfill starts from a coherent state.

**Step 1: Confirm the column name**

Run: `cd backend/backup_DB_SP && iconv -f UTF-16 -t UTF-8 dbo.tb_assy_tag.Table.sql | grep status`
Expected: `[status] [varchar](20) NULL` and `DEFAULT ('active')`. No `status_id`.

**Step 2: Fix the statement**

In [backend/server.js:41](../../backend/server.js#L41):

```js
                    .query(`UPDATE tb_assy_tag SET status = 'cleared', cleared_at = GETDATE() WHERE lot_no = @lot_no AND status = 'active'`);
```

The added `AND status = 'active'` matches `Stored_tb_assy_completed` and makes the update idempotent.

**Step 3: Verify against the database**

Start the server, insert a lot into `tb_assy_mock_done`, wait one 30s cycle:

```sql
SELECT lot_no, status, cleared_at FROM tb_assy_tag WHERE lot_no = '<test lot>'
SELECT lot_no, event_type FROM tb_assy_log WHERE lot_no = '<test lot>' AND event_type = 'COMPLETED'
```

Expected: tag row `cleared` with `cleared_at` set; one `COMPLETED` log row. Neither was true before.

> Leave the rest of the loop alone. Per D1 the user is replacing it with the AS400 check. When that happens it should call `processService.completeLot()` from Task 18 rather than inlining SQL again — note this in the handover.

---

## Task 3: Create the `db.js` seam

**Files:**
- Create: `backend/db.js`
- Create: `backend/test/unit/db.test.js`

The single place that knows about `mssql`.

**Step 1: Write the failing test**

Create `backend/test/unit/db.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { inferSqlType, typed, sql } = require('../../db');

test('inferSqlType maps JS values to mssql types', () => {
    assert.strictEqual(inferSqlType(5).name, 'Int');
    assert.strictEqual(inferSqlType('abc').name, 'VarChar');
    assert.strictEqual(inferSqlType(new Date()).name, 'DateTime');
    assert.strictEqual(inferSqlType(null).name, 'VarChar');
});

test('typed() forces a specific type', () => {
    assert.strictEqual(inferSqlType(typed(sql.Date, '2026-09-03')).name, 'Date');
});
```

**Step 2: Run to verify it fails**

Run: `cd backend && node --test test/unit/db.test.js`
Expected: FAIL — module not found

**Step 3: Implement**

Create `backend/db.js`:

```js
const { sql, poolPromise } = require('./database');

// Params are a plain object; types are inferred unless wrapped with typed(),
// which is required for DATE columns receiving a string.
const typed = (type, value) => ({ __sqlType: type, value });

const inferSqlType = (value) => {
    if (value && value.__sqlType) return value.__sqlType;
    if (typeof value === 'number') return Number.isInteger(value) ? sql.Int : sql.Float;
    if (value instanceof Date) return sql.DateTime;
    if (typeof value === 'boolean') return sql.Bit;
    return sql.VarChar;
};

const bind = (request, params) => {
    for (const [key, raw] of Object.entries(params)) {
        const value = raw && raw.__sqlType ? raw.value : raw;
        request.input(key, inferSqlType(raw), value === undefined ? null : value);
    }
    return request;
};

const query = async (text, params = {}) => {
    const pool = await poolPromise;
    return bind(pool.request(), params).query(text);
};

// Runs fn inside one transaction. fn receives a db-shaped object whose query()
// runs on the transaction, so services need no transaction awareness.
const transaction = async (fn) => {
    const pool = await poolPromise;
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const txDb = {
            query: (text, params = {}) => bind(new sql.Request(tx), params).query(text),
        };
        const out = await fn(txDb);
        await tx.commit();
        return out;
    } catch (err) {
        await tx.rollback();
        throw err;
    }
};

module.exports = { query, transaction, typed, inferSqlType, sql };
```

**Step 4: Run to verify it passes**

Run: `cd backend && node --test test/unit/db.test.js`
Expected: PASS

---

## Task 4: `apiLogService` — the pilot

**Files:**
- Create: `backend/services/apiLogService.js`
- Create: `backend/test/unit/apiLogService.test.js`
- Modify: `backend/routes/assembly.js:11-28`

Replaces `Stored_tb_assy_api_log_insert`. Chosen as the pilot: one unguarded INSERT, fire-and-forget, nothing reads its output.

**Step 1: Write the failing test**

Create `backend/test/unit/apiLogService.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { createFakeDb } = require('../helpers/fakeDb');
const { insertApiLog } = require('../../services/apiLogService');

test('insertApiLog binds every column and defaults missing fields to null', async () => {
    const db = createFakeDb([{ rowsAffected: [1] }]);
    await insertApiLog(db, { api_type: 'RECEIVE', method: 'GET', url: '/x' });

    const { sql, params } = db.calls[0];
    assert.match(sql, /INSERT INTO tb_assy_api_log/);
    assert.strictEqual(params.api_type, 'RECEIVE');
    assert.strictEqual(params.error_msg, null);
    assert.strictEqual(params.http_status, null);
});

test('insertApiLog swallows database errors', async () => {
    const db = createFakeDb([]);
    await assert.doesNotReject(() => insertApiLog(db, { api_type: 'RECEIVE' }));
});
```

**Step 2: Run to verify it fails**

Run: `cd backend && node --test test/unit/apiLogService.test.js`
Expected: FAIL — module not found

**Step 3: Implement**

Create `backend/services/apiLogService.js`:

```js
const COLUMNS = [
    'api_type', 'method', 'url', 'request_params', 'request_body',
    'http_status', 'status', 'response', 'error_msg', 'response_time_ms',
];

const INSERT_SQL = `
    INSERT INTO tb_assy_api_log (${COLUMNS.join(', ')})
    VALUES (${COLUMNS.map(c => '@' + c).join(', ')})`;

// Fire-and-forget: a logging failure must never fail the request being logged.
const insertApiLog = async (db, data) => {
    try {
        const params = Object.fromEntries(
            COLUMNS.map(c => [c, data[c] === undefined ? null : data[c]])
        );
        await db.query(INSERT_SQL, params);
    } catch (err) {
        console.error('[API Log Error]', err.message);
    }
};

module.exports = { insertApiLog };
```

**Step 4: Run to verify it passes**

Run: `cd backend && node --test test/unit/apiLogService.test.js`
Expected: PASS, 2 tests

**Step 5: Rewire the route**

In [backend/routes/assembly.js](../../backend/routes/assembly.js), delete the `logApi` helper (lines 11-28) and add at the top:

```js
const db = require('../db');
const { insertApiLog } = require('../services/apiLogService');
```

Replace both `await logApi(pool, {...})` calls in `GET /lot/:lot_no` with `await insertApiLog(db, {...})` — the object literals are unchanged. Drop the now-unused `const pool = await poolPromise;` at [line 33](../../backend/routes/assembly.js#L33).

**Step 6: Verify end to end**

Start the server, `curl http://localhost:5001/api/assembly/lot/<a real lot no>`, then:

```sql
SELECT TOP 1 * FROM tb_assy_api_log ORDER BY created_at DESC
```

Expected: a new row matching the pre-refactor shape.

---

## Task 5: `mockService`

**Files:**
- Create: `backend/services/mockService.js`
- Create: `backend/test/unit/mockService.test.js`
- Modify: `backend/routes/assembly.js:222-256`

Replaces `mock_done_{select,insert,delete}`.

> **Confirm before porting:** this is the simulation the user is replacing with the real AS400 check (D1). If Mock Done is going away, delete the three routes, the three SPs, and `frontend/src/pages/Assembly/MockDone.tsx` instead — strictly less work. Ask.

**Step 1: Write the failing tests**

Create `backend/test/unit/mockService.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { createFakeDb } = require('../helpers/fakeDb');
const { listMockDone, addMockDone, removeMockDone } = require('../../services/mockService');

test('listMockDone returns rows newest first', async () => {
    const db = createFakeDb([{ recordset: [{ lot_no: 'L2' }, { lot_no: 'L1' }] }]);
    const rows = await listMockDone(db);
    assert.strictEqual(rows.length, 2);
    assert.match(db.calls[0].sql, /ORDER BY created_at DESC/);
});

test('addMockDone reports a duplicate without inserting', async () => {
    const db = createFakeDb([{ recordset: [{ n: 1 }] }]);
    assert.deepStrictEqual(await addMockDone(db, 'L1'), { result: 'ALREADY_EXISTS' });
    assert.strictEqual(db.calls.length, 1);
});

test('addMockDone inserts when the lot is new', async () => {
    const db = createFakeDb([{ recordset: [] }, { rowsAffected: [1] }]);
    assert.deepStrictEqual(await addMockDone(db, 'L1'), { result: 'OK' });
    assert.match(db.calls[1].sql, /INSERT INTO tb_assy_mock_done/);
});

test('removeMockDone reports how many rows went', async () => {
    const db = createFakeDb([{ rowsAffected: [0] }]);
    assert.deepStrictEqual(await removeMockDone(db, 'L1'), { result: 'NOT_FOUND' });
});
```

> The old SP returned `'OK'` even when nothing was deleted. That is a bug in a dev tool, so the service reports `NOT_FOUND` instead. Task 10 turns it into a 404; until then the route passes `result` through and the UI shows it.

**Step 2: Run to verify they fail**

Run: `cd backend && node --test test/unit/mockService.test.js`
Expected: FAIL — module not found

**Step 3: Implement**

Create `backend/services/mockService.js`:

```js
const listMockDone = async (db) => {
    const out = await db.query(
        `SELECT id, lot_no, created_at FROM tb_assy_mock_done ORDER BY created_at DESC`);
    return out.recordset;
};

const addMockDone = async (db, lotNo) => {
    const existing = await db.query(
        `SELECT 1 AS n FROM tb_assy_mock_done WHERE lot_no = @lot_no`, { lot_no: lotNo });
    if (existing.recordset.length > 0) return { result: 'ALREADY_EXISTS' };

    await db.query(`INSERT INTO tb_assy_mock_done (lot_no) VALUES (@lot_no)`, { lot_no: lotNo });
    return { result: 'OK' };
};

const removeMockDone = async (db, lotNo) => {
    const out = await db.query(
        `DELETE FROM tb_assy_mock_done WHERE lot_no = @lot_no`, { lot_no: lotNo });
    return { result: out.rowsAffected[0] > 0 ? 'OK' : 'NOT_FOUND' };
};

module.exports = { listMockDone, addMockDone, removeMockDone };
```

> The SP used `SELECT *`; this names its columns. Confirm `MockDone.tsx` reads only `id`, `lot_no`, `created_at` before committing.

**Step 4: Run to verify they pass**

Run: `cd backend && node --test test/unit/mockService.test.js`
Expected: PASS, 4 tests

**Step 5: Rewire the routes**

```js
router.get('/mock-done', async (req, res) => {
    try { res.json(await listMockDone(db)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/mock-done', async (req, res) => {
    try { res.json(await addMockDone(db, req.body.lot_no)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/mock-done/:lot_no', async (req, res) => {
    try { res.json(await removeMockDone(db, req.params.lot_no)); }
    catch (err) { res.status(500).json({ error: err.message }); }
});
```

**Step 6: Verify in the browser**

Mock Done page: add a lot, add it again (duplicate message), delete it, delete it again.

---

## Task 6: `masterService` — status master

**Files:**
- Create: `backend/services/masterService.js`
- Create: `backend/test/unit/masterService.test.js`
- Modify: `backend/routes/assembly.js:369-421`

Replaces `master_assy_status_{select,insert,update,delete}`.

**Interim error handling.** Until Task 10 these keep the `{ result: err.message }` convention so the frontend is untouched — Phase 2 and Phase 3 stay separately revertable. Task 10 replaces `asResult` with typed throws.

**Step 1: Write the failing tests**

Create `backend/test/unit/masterService.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { createFakeDb } = require('../helpers/fakeDb');
const {
    listStatuses, createStatus, updateStatus, deleteStatus,
} = require('../../services/masterService');

test('listStatuses joins the process master', async () => {
    const db = createFakeDb([{ recordset: [{ id: 1, status: 'bf_issue', process_code: '1400' }] }]);
    const rows = await listStatuses(db);
    assert.strictEqual(rows[0].process_code, '1400');
    assert.match(db.calls[0].sql, /LEFT JOIN tb_master_process/);
});

test('createStatus returns OK', async () => {
    const db = createFakeDb([{ rowsAffected: [1] }]);
    assert.deepStrictEqual(
        await createStatus(db, { status: 's', label_status: 'S', process_id: 1 }),
        { result: 'OK' });
});

test('createStatus returns the error message as result, not a throw', async () => {
    const db = { query: async () => { throw new Error('FK violation'); } };
    assert.deepStrictEqual(
        await createStatus(db, { status: 's', label_status: 'S', process_id: 99 }),
        { result: 'FK violation' });
});

test('updateStatus passes a null process_id through', async () => {
    const db = createFakeDb([{ rowsAffected: [1] }]);
    await updateStatus(db, { id: 1, status: 's', label_status: 'S', process_id: null });
    assert.strictEqual(db.calls[0].params.process_id, null);
});

test('deleteStatus returns OK', async () => {
    const db = createFakeDb([{ rowsAffected: [1] }]);
    assert.deepStrictEqual(await deleteStatus(db, 1), { result: 'OK' });
});
```

**Step 2: Run to verify they fail**

Run: `cd backend && node --test test/unit/masterService.test.js`
Expected: FAIL — module not found

**Step 3: Implement**

Create `backend/services/masterService.js`:

```js
// Interim: the SPs returned SQL errors as a `result` string and the frontend
// depends on it. Task 10 replaces this with typed errors and HTTP codes.
const asResult = async (fn) => {
    try {
        await fn();
        return { result: 'OK' };
    } catch (err) {
        return { result: err.message };
    }
};

const listStatuses = async (db) => {
    const out = await db.query(`
        SELECT s.id, s.status, s.label_status, s.process_id, p.process_code, p.process_name
        FROM tb_master_assy_status s
        LEFT JOIN tb_master_process p ON p.id = s.process_id`);
    return out.recordset;
};

const createStatus = (db, { status, label_status, process_id }) =>
    asResult(() => db.query(
        `INSERT INTO tb_master_assy_status (status, label_status, process_id)
         VALUES (@status, @label_status, @process_id)`,
        { status, label_status, process_id: process_id ?? null }));

const updateStatus = (db, { id, status, label_status, process_id }) =>
    asResult(() => db.query(
        `UPDATE tb_master_assy_status
         SET status = @status, label_status = @label_status, process_id = @process_id
         WHERE id = @id`,
        { id, status, label_status, process_id: process_id ?? null }));

const deleteStatus = (db, id) =>
    asResult(() => db.query(`DELETE FROM tb_master_assy_status WHERE id = @id`, { id }));

module.exports = { asResult, listStatuses, createStatus, updateStatus, deleteStatus };
```

**Step 4: Run to verify they pass**

Run: `cd backend && node --test test/unit/masterService.test.js`
Expected: PASS, 5 tests

**Step 5: Rewire the four routes**

Follow the Task 5 pattern. The routes currently pass `process_id || null`; pass `req.body.process_id` straight through and let the service's `?? null` handle it, so `process_id: 0` is no longer silently nulled. `0` is not a valid identity value here, so this is safe — mention it in the commit.

**Step 6: Verify in the browser**

Management → Status tab: list, create, edit, delete. Then delete a status that lots reference and confirm the FK error still reaches the UI.

---

## Task 7: `masterService` — process master

**Files:**
- Modify: `backend/services/masterService.js`, its test, `backend/routes/assembly.js:426-476`

Replaces `master_process_{select,insert,update,delete}`. Same shape as Task 6, no joins. Add `listProcesses`, `createProcess`, `updateProcess`, `deleteProcess` reusing `asResult`.

```sql
SELECT id, process_code, process_name FROM tb_master_process
INSERT INTO tb_master_process (process_code, process_name) VALUES (@process_code, @process_name)
UPDATE tb_master_process SET process_code = @process_code, process_name = @process_name WHERE id = @id
DELETE FROM tb_master_process WHERE id = @id
```

> The SP had no `ORDER BY`. Add `ORDER BY process_code` — the Management list rendering in an arbitrary order is a latent annoyance, and `dashboard_process_summary` already orders this way. This is a deliberate small improvement, not a preservation.

> **2026-10-14:** `tb_master_process` gained `can_clear_tag BIT NOT NULL DEFAULT 0` after this task shipped (`alter_process_can_clear_tag.sql`). The four functions here still read and write only `process_code`, `process_name`. See FE finding F1.

One test per function plus an error-path test. Verify via Management → Process tab.

---

## Task 8: `userService`

**Files:**
- Create: `backend/services/userService.js`, `backend/test/unit/userService.test.js`
- Modify: `backend/routes/assembly.js:296-366`

Replaces `login_verify`, `login_{select,insert,update,delete}`. **Passwords stay plaintext in this task** — Task 9 adds bcrypt, separately, so a hashing bug is not tangled up with a porting bug.

Two contracts to keep:

1. `verifyLogin` selects `id, emp_id, eng_name, eng_surname, position` — **never `password`**. The route turns an empty result into 401.
2. `updateUser` updates only `eng_name`, `eng_surname`, `position`. It does not touch `emp_id` or `password`. There is no password-change path in this system; do not add one here.

```js
verifyLogin(db, empId, password)   // → user object or null
listUsers(db)                      // → array
createUser(db, {emp_id, eng_name, eng_surname, password, position})  // → {result}
updateUser(db, {id, eng_name, eng_surname, position})                // → {result}
deleteUser(db, id)                                                    // → {result}
```

Import `asResult` from `masterService` — or extract it to `backend/services/_result.js` now that it has a second consumer. Either is fine; Task 10 deletes it anyway.

Tests must include: `verifyLogin` returns null on no match; the SELECT projection contains no `password` column (assert on the projection specifically — `password` still legitimately appears in the WHERE); `updateUser` omits `emp_id`.

Verify: log in as a known user; log in with a wrong password (401); Management → User tab CRUD.

---

## Task 9: D8 — hash passwords with bcryptjs

**Files:**
- Modify: `backend/package.json`, `backend/services/userService.js`, its test
- Create: `backend/scripts/rehash_passwords.js`
- Create: `backend/backup_DB_SP/alter_login_password_width.sql`

`bcryptjs`, not `bcrypt` — the native build needs a compiler toolchain, and this machine already carries `msnodesqlv8` with `allowScripts` pinned. Do not add a second native dependency to a 32-bit-Python OT box. `bcryptjs` is pure JS and slower in a way that is irrelevant at this login volume.

**Step 1: Widen the column**

`tb_assy_login.password` is `VARCHAR(50)`; a bcrypt hash is 60 characters. Create `alter_login_password_width.sql`:

```sql
USE [db_rfid_assembly]
GO
ALTER TABLE tb_assy_login ALTER COLUMN password VARCHAR(72) NOT NULL
GO
```

72 not 60 — bcrypt's own input limit, and it leaves room for an algorithm change. **Present for approval; do not run automatically** (project convention: schema changes are approved before running).

**Step 2: Install**

Run: `cd backend && npm install bcryptjs`

**Step 3: Write the failing tests**

```js
test('createUser stores a hash, never the plaintext', async () => {
    const db = createFakeDb([{ rowsAffected: [1] }]);
    await createUser(db, { emp_id: 'E1', eng_name: 'A', eng_surname: 'B',
                           password: 'secret', position: 'user' });
    const stored = db.calls[0].params.password;
    assert.notStrictEqual(stored, 'secret');
    assert.match(stored, /^\$2[aby]\$/);
});

test('verifyLogin returns the user when the password matches its hash', async () => {
    const bcrypt = require('bcryptjs');
    const hash = bcrypt.hashSync('secret', 10);
    const db = createFakeDb([{ recordset: [{ id: 1, emp_id: 'E1', password: hash,
                                             position: 'admin' }] }]);
    const user = await verifyLogin(db, 'E1', 'secret');
    assert.strictEqual(user.emp_id, 'E1');
    assert.strictEqual(user.password, undefined, 'password must not be returned');
});

test('verifyLogin returns null on a wrong password', async () => {
    const bcrypt = require('bcryptjs');
    const db = createFakeDb([{ recordset: [{ id: 1, emp_id: 'E1',
                                             password: bcrypt.hashSync('secret', 10) }] }]);
    assert.strictEqual(await verifyLogin(db, 'E1', 'wrong'), null);
});
```

**The shape of `verifyLogin` has to change.** Comparison moves out of SQL into JS, so the query must now select the hash by `emp_id` alone and the service must strip it from what it returns:

```js
const verifyLogin = async (db, empId, password) => {
    const out = await db.query(
        `SELECT id, emp_id, eng_name, eng_surname, position, password
         FROM tb_assy_login WHERE emp_id = @emp_id`,
        { emp_id: empId });

    const row = out.recordset[0];
    if (!row) return null;
    if (!bcrypt.compareSync(password, row.password)) return null;

    const { password: _discarded, ...user } = row;
    return user;
};
```

The hash now crosses the service boundary where it never did before. The destructure above is the only thing keeping it out of the HTTP response — the third test exists specifically to pin that.

**Step 4: Hash on write**

`createUser` hashes with `bcrypt.hashSync(password, 10)`. `updateUser` does not touch passwords at all, so it needs no change.

**Step 5: Rehash existing rows**

Create `backend/scripts/rehash_passwords.js` — a one-off that reads every row, skips any value already matching `/^\$2[aby]\$/`, hashes the rest, and writes them back. Print a count. Run once, after the column widening, with the server stopped.

**Step 6: Verify**

Run the script, then log in with a known account through the UI. Then:

```sql
SELECT emp_id, password FROM tb_assy_login
```

Expected: every value starts `$2a$` or `$2b$`. No plaintext.

---

## Task 10: D9 — real HTTP status codes for the CRUD family

**Files:**
- Create: `backend/services/errors.js`, `backend/test/unit/errors.test.js`
- Modify: `backend/services/{masterService,userService,mockService}.js` + tests
- Modify: `backend/routes/assembly.js` — CRUD routes only
- Modify: `frontend/src/pages/Assembly/Management/{UserTab,StatusTab,ProcessTab}.tsx`, `MockDone.tsx`
- Modify: `frontend/src/types/api.ts` (`AdminResult`), `frontend/src/mocks/handlers/admin.ts` — mock mode must return the same 4xx codes (added 2026-10-14; see F3)

**Scope is exactly the CRUD family.** `/login/users*`, `/status*`, `/process*`, `/mock-done*`. **The process family keeps `200 {result}`** — see the contract boundary above. Getting this wrong breaks the Python service.

**Step 1: Define the error types**

Create `backend/services/errors.js`:

```js
class AppError extends Error {
    constructor(code, message, status) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

class ValidationError extends AppError {
    constructor(message) { super('VALIDATION_ERROR', message, 400); }
}
class NotFoundError extends AppError {
    constructor(message) { super('NOT_FOUND', message, 404); }
}
class ConflictError extends AppError {
    constructor(message) { super('CONFLICT', message, 409); }
}

// SQL Server error numbers that map to a client-fixable problem rather than a
// server fault. Anything else is a genuine 500 and must not be swallowed.
const SQL_DUPLICATE_KEY = [2601, 2627];
const SQL_FK_VIOLATION = [547];

const fromSqlError = (err) => {
    if (SQL_DUPLICATE_KEY.includes(err.number)) {
        return new ConflictError('That value already exists.');
    }
    if (SQL_FK_VIOLATION.includes(err.number)) {
        return new ConflictError('This record is still referenced by other data.');
    }
    return err;
};

module.exports = { AppError, ValidationError, NotFoundError, ConflictError, fromSqlError };
```

`fromSqlError` returns a friendly message instead of the raw SQL text — that is the leak D9 is about. The original stays available in the server log.

**Step 2: Replace `asResult` with typed throws**

Delete `asResult`. Each write becomes:

```js
const createStatus = async (db, { status, label_status, process_id }) => {
    try {
        await db.query(`INSERT INTO ...`, { ... });
    } catch (err) {
        throw fromSqlError(err);
    }
};
```

Successful writes return nothing. `deleteStatus` throws `NotFoundError` when `rowsAffected[0] === 0`. `createUser` throws `ValidationError` when `emp_id` is missing or empty — that is the boundary validation the system currently has none of.

Update every existing test: `{result:'OK'}` assertions become "does not reject"; the error-path tests become `assert.rejects(..., ConflictError)`.

**Step 3: Add the error middleware**

In [backend/server.js](../../backend/server.js), **after** `app.use('/api/assembly', assemblyRoutes)`:

```js
app.use((err, req, res, next) => {
    if (err.status) {
        return res.status(err.status).json({ error: err.code, message: err.message });
    }
    console.error('[Unhandled]', err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unexpected server error.' });
});
```

**Step 4: Rewire the CRUD routes**

Routes keep explicit `try/catch` and forward to `next` — do not rely on Express 5 auto-forwarding, which was not verified:

```js
router.post('/status', async (req, res, next) => {
    try {
        await createStatus(db, req.body);
        res.status(201).json({ result: 'OK' });
    } catch (err) { next(err); }
});
```

Keeping `{result:'OK'}` in the success body means the frontend's success path needs no change — only its error path does.

**Step 5: Update the frontend**

Find the call sites first:

Run: `cd frontend/src && grep -rn "result !== 'OK'\|result === 'OK'\|\.result" pages/Assembly/`

> **2026-10-14:** the grep finds no `result` check in the Management tabs. They already wrap each call in `try/catch` and treat **any** 2xx as success (e.g. [ProcessTab.tsx:29-41](../../frontend/src/pages/Assembly/Management/ProcessTab.tsx#L29-L41)). So today a SQL error (`200 {result:'<SQL text>'}`) shows a **success** toast. Task 10 fixes this on the backend side; on the frontend only the `catch` message changes. `MockDone.tsx:47-52` is the one page that checks `result`.

For each, replace the `data.result !== 'OK'` error check with a non-2xx check. With axios, a non-2xx rejects, so the shape is:

```js
try {
    await backendApi.post('/status', payload);
    Swal.fire({ icon: 'success', title: 'Saved' });
} catch (err) {
    Swal.fire({ icon: 'error', title: err.response?.data?.message ?? 'Request failed' });
}
```

**Step 6: Verify every path in the browser**

For each of the four tabs: create, edit, delete, and at least one failure — a duplicate `emp_id` (409), a status still referenced by lots (409), a delete of something already gone (404). Confirm the message is the friendly one and **no SQL error text reaches the browser**.

---

## Task 11: Characterization baselines for the dashboard

**Files:**
- Create: `backend/test/integration/README.md`, `backend/test/integration/dashboard.characterization.test.js`

The dashboard SQL is about to change deliberately (D5, D6). Record what it returns now so the change can be reviewed rather than guessed at. **Unlike the earlier version of this plan, these baselines are expected to differ afterwards** — they are a diff to review, not an assertion that must hold.

Create the README explaining: these hit a real database, are read-only, are skipped unless `RUN_DB_TESTS=1`, and are not run by any pipeline (there is none).

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { sql, poolPromise } = require('../../database');

const RUN = process.env.RUN_DB_TESTS === '1';

test('dashboard SP shape and numbers, recorded', { skip: !RUN }, async () => {
    const pool = await poolPromise;
    const result = await pool.request()
        .input('date_from', sql.Date, null).input('date_to', sql.Date, null)
        .input('brg_type', sql.VarChar, null).input('wos', sql.VarChar, null)
        .input('lot_no', sql.VarChar, null).input('status_id', sql.Int, null)
        .execute('Stored_tb_assy_dashboard');

    assert.strictEqual(result.recordsets.length, 3);
    console.log('BASELINE summary:', JSON.stringify(result.recordsets[0][0]));
    console.log('BASELINE lots count:', result.recordsets[2].length);
});
```

Add equivalents for `dashboard_history`, `dashboard_process_summary` (assert processes with zero lots still appear with `inventory_qty = 0`), and `clear_tag_history`.

Run: `cd backend && $env:RUN_DB_TESTS=1; npm run test:integration`

**Paste the printed BASELINE lines into this file under Task 13** before moving on. Task 13 needs them.

---

## Task 12: `dashboardService` — history, process summary, clear-tag history

**Files:**
- Create: `backend/services/dashboardService.js`, `backend/test/unit/dashboardService.test.js`
- Modify: `backend/routes/assembly.js:501-529`, `544-556`

Straight ports — the interesting changes are in Task 13.

**The shared filter block**, used here and in Task 13:

```js
// Every filter is optional; a null parameter disables its clause. Mirrors the
// (@p IS NULL OR col = @p) idiom the stored procedures used.
const LOT_FILTERS = `
    AND (@date_from     IS NULL OR CAST(l.created_at AS DATE) >= @date_from)
    AND (@date_to       IS NULL OR CAST(l.created_at AS DATE) <= @date_to)
    AND (@brg_type      IS NULL OR w.brg_type     LIKE '%' + @brg_type + '%')
    AND (@wos           IS NULL OR l.wos          LIKE '%' + @wos      + '%')
    AND (@lot_no        IS NULL OR l.lot_no       LIKE '%' + @lot_no   + '%')
    AND (@status_id     IS NULL OR l.status_id     = @status_id)`;
```

**Dates.** `date_from`/`date_to` arrive from `req.query` as strings; the SPs declared them `DATE`. Use `typed(sql.Date, value || null)`. Getting this wrong returns wrong rows rather than erroring — pin it with a unit test.

**`process_summary` — keep the join predicate exactly:**

```sql
FROM tb_master_process p
LEFT JOIN tb_master_assy_status s ON s.process_id = p.id
LEFT JOIN tb_assy_lot l ON l.status_id = s.id AND l.status_id != 4
GROUP BY p.id, p.process_code, p.process_name
ORDER BY p.process_code ASC
```

`AND l.status_id != 4` **must stay in the ON clause**. Moving it to WHERE drops processes currently showing `inventory_qty = 0`. `ISNULL(SUM(l.qty), 0)` stays too — without it those rows return null and [processBreakdown.ts:17-22](../../frontend/src/pages/Assembly/processBreakdown.ts#L17-L22) sums and divides them into `NaN` (the percent bars break, not just one cell).

> **2026-10-14 — FE calls this task did not list:**
> - `GET /clear-tag/history` — the page now sends `search` ([ClearTag.tsx:178-179](../../frontend/src/pages/Assembly/ClearTag.tsx#L178-L179)) and the SP accepts `@search` (`alter_clear_tag_history_search.sql`), but the route only binds `date_from`, `date_to`. Search does nothing on the real backend. See F2.
> - `GET /dashboard/locations` — reads `reader_config.json` with a CWD-relative path (D7). Belongs with Task 19.
> - `GET /dashboard/daily-inventory` — called by [Dashboard.tsx:133](../../frontend/src/pages/Assembly/Dashboard.tsx#L133), has a Bruno request, but **no backend route**. It works only in mock mode. See F4.

Unit tests: `TOP 200` present on both list queries; date params bound as `sql.Date`; `process_summary`'s `!= 4` appears before `GROUP BY`.

Verify: Dashboard → Detail tab with each filter alone and combined; Inventory Summary table; Clear Tag → History with a date range.

---

## Task 13: `dashboardService` — the main dashboard (D5, D6, FLAG-1)

**Files:**
- Modify: `backend/services/dashboardService.js`, its test, `backend/routes/assembly.js:479-499`

Replaces `Stored_tb_assy_dashboard`. Two deliberate behaviour changes.

**D6 — delete the top-5 recordset.** No page reads it: [Dashboard.tsx:105](../../frontend/src/pages/Assembly/Dashboard.tsx#L105) derives its part-number options from `history`. Removing it also removes the `total_qty`-means-two-things collision. The route's response becomes `{ summary, lots }`.

> Before deleting, confirm: `cd frontend/src && grep -rn "top5\|Top5" .` — **as of 2026-10-14 this is not empty.** It finds the type ([types/api.ts:55](../../frontend/src/types/api.ts#L55), [:70](../../frontend/src/types/api.ts#L70)) and the mock ([mocks/handlers/dashboard.ts:39](../../frontend/src/mocks/handlers/dashboard.ts#L39), [:64](../../frontend/src/mocks/handlers/dashboard.ts#L64)). No page uses them. Delete `Top5Row`, the `top5` field and `topBearingTypes` in the same change. See F5.

**D5 — one filter block for both remaining queries.** `status_id != 4` moves into the WHERE clause of both, alongside all six filters. Concretely, the summary query changes from

```sql
-- before: exclusion only inside the SUMs, so the filtered SET still held completed lots
SUM(CASE WHEN l.status_id != 4 THEN l.qty ELSE 0 END) AS total_qty
FROM ... WHERE (@date_from IS NULL OR ...) AND ...
```

to

```sql
SUM(l.qty)                                        AS total_qty,
SUM(CASE WHEN l.status_id = 1 THEN l.qty ELSE 0 END) AS bf_issue,
SUM(CASE WHEN l.status_id = 2 THEN l.qty ELSE 0 END) AS gr_f1,
SUM(CASE WHEN l.status_id = 3 THEN l.qty ELSE 0 END) AS mc_f1
FROM tb_assy_lot l
LEFT JOIN tb_assy_wos w ON w.wos = l.wos
WHERE l.status_id != 4
  ${LOT_FILTERS}
```

The column names are unchanged, so the summary cards at [Dashboard.tsx:316-317](../../frontend/src/pages/Assembly/Dashboard.tsx#L316-L317) need no edit.

A consequence worth knowing: filtering by `status_id = 4` now returns zeros over an *empty* set, which is coherent, where before it returned zeros over a *non-empty* set. Same display, better meaning.

**Three queries, not one.** Two sequential `db.query` calls where the SP was one round trip. At ~1,000 lots/day on a LAN this is not a concern. Do not batch them back together — that reintroduces the multi-recordset handling this refactor removes.

**FLAG-1 — put this comment above the summary query, verbatim:**

```js
// FLAG: the four summary cards count lot qty across statuses 1-3, excluding
// completed. Whether that is what the line supervisors actually want to see has
// never been confirmed — the pre-refactor SQL was internally inconsistent, so
// there is no reliable "original intent" to appeal to. Recap with the user.
// See docs/plans/2026-09-03-backend-service-layer-refactor.md FLAG-1.
```

Unit tests: assert the summary and lots queries apply the same filter set; assert `status_id != 4` is in the WHERE of both; assert the response has no `top5` key.

**Then diff against the Task 11 baselines.** Numbers are expected to move. Review each difference and confirm it is explained by D5/D6 — an unexplained difference is a porting bug.

Verify: Dashboard → Summary tab, all four cards, with and without filters. Compare against a screenshot taken before.

---

## Task 14: Enforce the tag-pairing invariant (D4)

**Files:**
- Create: `backend/backup_DB_SP/fix_tag_pairing.sql`

> *A tag pairs with one lot at a time. Reuse requires clearing first.*

Nothing enforces this today. Make it a database constraint.

**No data backfill.** Because of D2 the existing `tb_assy_tag` rows are inconsistent — clears never wrote, so rows sit at `status = 'active'` whose lots completed long ago. The user has confirmed **this data is not real and is not in use**, so it is cleared rather than repaired. That turns what would have been an operational cleanup into two statements.

**This task is a constraint plus a data reset. No JS. Do it before Tasks 16-18, which depend on the invariant holding.**

**Step 1: Confirm the data is disposable**

```sql
SELECT COUNT(*) AS tag_rows FROM tb_assy_tag;
SELECT COUNT(*) AS lot_rows FROM tb_assy_lot;
```

If either number looks like real production tracking rather than test scans, **stop and confirm with the user before continuing** — Step 2 is irreversible.

**Step 2: Clear the test data**

FK-safe order. `tb_assy_log` and `tb_assy_tag` reference lots by `lot_no`:

```sql
DELETE FROM tb_assy_log;
DELETE FROM tb_assy_tag;
DELETE FROM tb_assy_lot;
```

> `DELETE`, not `TRUNCATE` — `tb_assy_lot` is the target of an FK from `tb_assy_lot.status_id`'s perspective only, but `TRUNCATE` is blocked on any table referenced by a foreign key and reseeds identity, which is not wanted. Leave `tb_assy_wos` alone; WOS records are reference data, harmless to keep, and re-created on demand by `register`.

**Take a database backup before running this**, even on dev. It costs a minute and the alternative is re-seeding by hand.

**Step 3: Create the constraint**

```sql
CREATE UNIQUE INDEX UX_assy_tag_active
    ON tb_assy_tag(tag_id)
    WHERE status = 'active';
```

A filtered unique index — the database now guarantees at most one active pairing per tag, whatever any future code does. This is the single most valuable line in the whole plan: it makes the requirement unbreakable rather than merely intended.

> Filtered indexes require `QUOTED_IDENTIFIER ON` in any session that later writes to this table. The `mssql` driver sets it by default; if inserts start failing with error 1934 after this, that is the cause.

**Step 4: Verify the constraint bites**

```sql
-- Should succeed
INSERT INTO tb_assy_tag (tag_id, lot_no, status) VALUES ('ZZTEST', 'ZZLOT1', 'active');
-- Should fail with a duplicate key error on UX_assy_tag_active
INSERT INTO tb_assy_tag (tag_id, lot_no, status) VALUES ('ZZTEST', 'ZZLOT2', 'active');
-- Should succeed — cleared rows are outside the filter
INSERT INTO tb_assy_tag (tag_id, lot_no, status) VALUES ('ZZTEST', 'ZZLOT3', 'cleared');
DELETE FROM tb_assy_tag WHERE tag_id = 'ZZTEST';
```

Per project convention: present the script and the Step 1 row counts for approval before running it. It contains `DELETE` statements against three tables.

> **Vocabulary note:** the user described the cleared state as "unactive". The existing schema default and the SPs use `'cleared'`. Keep `'cleared'` — changing the vocabulary means touching data, SPs, and the ER diagram for no functional gain.

---

## Task 15: Characterization tests for lot and process transitions

**Files:**
- Create: `backend/test/integration/process.characterization.test.js`

Pin the transition behaviour before porting it. These **write**, so they create and clean up their own data.

Cover every guard branch:

| SP | Branches |
|---|---|
| `register` | `OK`, `LOT_ALREADY_EXISTS`, `TAG_IN_USE`, `INVALID_STATUS` |
| `gauging_room_f1` | `OK` (from 1), `TAG_NOT_FOUND`, `INVALID_PROCESS` (from 2, 3, 4) |
| `mc_gauging_f1` | `OK` (from 2), `TAG_NOT_FOUND`, `INVALID_PROCESS` (from 1, 3, 4) |
| `completed` | `OK` (from 3), `LOT_NOT_FOUND`, `INVALID_PROCESS` (from 1, 2), `INVALID_STATUS` |
| `change_process` | `OK`, `TAG_NOT_FOUND`, `INVALID_STATUS`, `ALREADY_COMPLETED`, `SAME_STATUS` |

Pin the **side effects** too, not just the return code. After a successful `completed`: `tb_assy_lot.status_id = 4` with `cleared_at` set, `tb_assy_tag.status = 'cleared'`, exactly one `COMPLETED` row in `tb_assy_log`.

Use a `ZZTEST` lot prefix and delete everything you created in a `t.after()` hook, FK-safe: `tb_assy_log`, `tb_assy_tag`, `tb_assy_lot`.

> **Do not run these against a database the line is actively using.** Use a restored copy. If none exists, raise it as a blocker before starting Phase 5 rather than running them anyway.

---

## Task 16: `lotService` (D3, D4)

**Files:**
- Create: `backend/services/lotService.js`, `backend/test/unit/lotService.test.js`
- Modify: `backend/routes/assembly.js:77-106`, `110-127`

Replaces `lot_by_tag` and `register`.

**Split `lot_by_tag` into two functions.** The SP ORs `@tag_id` and `@lot_no`, and both routes already pass `null` for the one they do not use. Write `findActiveLotByTag(db, tagId)` and `findActiveLotByLotNo(db, lotNo)` sharing a private SELECT constant. Both keep `WHERE l.status_id != 4` and the `LEFT JOIN tb_assy_wos`, both return one row or `null`, and the routes turn `null` into their existing 404s.

**`register` runs in a transaction (D3), and `TAG_IN_USE` now consults `tb_assy_tag` (D4):**

```js
const registerLot = async (db, { lot_no, wos, brg_type, spec, qty, tag_id, location_name }) =>
    db.transaction(async (tx) => {
        const statusOk = await tx.query(
            `SELECT 1 AS n FROM tb_master_assy_status WHERE id = 1`);
        if (statusOk.recordset.length === 0) return { result: 'INVALID_STATUS' };

        // UPDLOCK/HOLDLOCK closes the check-then-insert race (D3). The UNIQUE
        // constraint on lot_no is the backstop if this is ever bypassed.
        const dupe = await tx.query(
            `SELECT 1 AS n FROM tb_assy_lot WITH (UPDLOCK, HOLDLOCK) WHERE lot_no = @lot_no`,
            { lot_no });
        if (dupe.recordset.length > 0) return { result: 'LOT_ALREADY_EXISTS' };

        // D4: tb_assy_tag is the pairing authority, guarded by UX_assy_tag_active.
        const paired = await tx.query(
            `SELECT 1 AS n FROM tb_assy_tag WITH (UPDLOCK, HOLDLOCK)
             WHERE tag_id = @tag_id AND status = 'active'`,
            { tag_id });
        if (paired.recordset.length > 0) return { result: 'TAG_IN_USE' };

        await tx.query(
            `IF NOT EXISTS (SELECT 1 FROM tb_assy_wos WHERE wos = @wos)
                 INSERT INTO tb_assy_wos (wos, brg_type, spec) VALUES (@wos, @brg_type, @spec)`,
            { wos, brg_type, spec });

        await tx.query(
            `INSERT INTO tb_assy_lot (lot_no, wos, qty, tag_id, status_id, location_name)
             VALUES (@lot_no, @wos, @qty, @tag_id, 1, @location_name)`,
            { lot_no, wos, qty, tag_id, location_name: location_name ?? null });

        await tx.query(
            `INSERT INTO tb_assy_tag (tag_id, lot_no, status) VALUES (@tag_id, @lot_no, 'active')`,
            { tag_id, lot_no });

        await tx.query(
            `INSERT INTO tb_assy_log (lot_no, tag_id, event_type, location_name, remark)
             VALUES (@lot_no, @tag_id, 'REGISTER', @location_name, 'Tag registered')`,
            { lot_no, tag_id, location_name: location_name ?? null });

        return { result: 'OK' };
    });
```

**Map duplicate-key errors to the right business code.** If `UX_assy_tag_active` or the `lot_no` UNIQUE fires despite the locks — a genuine race — the route must not return 500. Catch `err.number` in `[2601, 2627]` and map by constraint name: `UX_assy_tag_active` → `TAG_IN_USE`, otherwise → `LOT_ALREADY_EXISTS`. The operator then sees the correct message rather than a server error.

Unit tests: one per guard branch, asserting both the returned code and that no INSERT followed a fired guard (`db.calls.length`); one asserting `registerLot` runs inside `transaction()`; one asserting the `TAG_IN_USE` check queries `tb_assy_tag`, not `tb_assy_lot`.

Verify: register a fresh lot; register it again (`LOT_ALREADY_EXISTS`); bind the same tag to a second lot (`TAG_IN_USE`); complete the first lot, then bind that tag to a new lot (must now succeed — this is the reuse requirement). Re-run Task 15's characterization tests.

---

## Task 17: `processService` — the ordered transitions

**Files:**
- Create: `backend/services/processService.js`, `backend/test/unit/processService.test.js`
- Modify: `backend/routes/assembly.js:130-157`

Replaces `gauging_room_f1` and `mc_gauging_f1`. **Highest-risk task in the plan** — the Python service calls these.

The two SPs are the same algorithm: find lot by tag → assert current status → update lot → append log. Collapse to one helper:

```js
// Guarded state transition. The UPDLOCK on the read is what makes the
// check-then-write atomic — without it two concurrent scans of the same tag
// can both pass the `from` check.
const transition = (db, { tagId, from, to, event, locationName }) =>
    db.transaction(async (tx) => {
        const statusOk = await tx.query(
            `SELECT 1 AS n FROM tb_master_assy_status WHERE id = @to`, { to });
        if (statusOk.recordset.length === 0) return { result: 'INVALID_STATUS' };

        const lot = await tx.query(
            `SELECT lot_no, status_id FROM tb_assy_lot WITH (UPDLOCK, ROWLOCK)
             WHERE tag_id = @tag_id`,
            { tag_id: tagId });
        if (lot.recordset.length === 0) return { result: 'TAG_NOT_FOUND' };
        if (lot.recordset[0].status_id !== from) return { result: 'INVALID_PROCESS' };

        await tx.query(
            `UPDATE tb_assy_lot
             SET status_id = @to, location_name = @location_name, updated_at = GETDATE()
             WHERE tag_id = @tag_id`,
            { to, location_name: locationName ?? null, tag_id: tagId });

        await tx.query(
            `INSERT INTO tb_assy_log (lot_no, tag_id, event_type, location_name)
             VALUES (@lot_no, @tag_id, @event, @location_name)`,
            { lot_no: lot.recordset[0].lot_no, tag_id: tagId, event,
              location_name: locationName ?? null });

        return { result: 'OK' };
    });

const enterGaugingRoomF1 = (db, tagId, locationName) =>
    transition(db, { tagId, from: 1, to: 2, event: 'GAUGING_ROOM_F1', locationName });

const enterMcGaugingF1 = (db, tagId, locationName) =>
    transition(db, { tagId, from: 2, to: 3, event: 'MC_GAUGING_F1', locationName });
```

**D10 — rename the wrong-order code to `INVALID_PROCESS_ORDER`.** The SPs return `INVALID_PROCESS`, but [main_assy.py:77](../../service/main_assy.py#L77) branches on `INVALID_PROCESS_ORDER` and `overview_diagram/README.md` §1 documents `INVALID_PROCESS_ORDER`. The branch has never fired: wrong-order scans fall through to `else` and log `WARNING` instead of the intended silent skip. The Python service is the frozen client, so **the backend moves to match it**, not the other way round.

In the helper above, the guard becomes:

```js
if (lot.recordset[0].status_id !== from) return { result: 'INVALID_PROCESS_ORDER' };
```

> **Check the frontend before committing.** `changeProcess` (Task 18) is a different code path and keeps `INVALID_PROCESS`, but confirm nothing in `frontend/src/` string-matches `INVALID_PROCESS` for the reader endpoints:
> `cd frontend/src && grep -rn "INVALID_PROCESS" .`
> Update the frozen-contract table in this plan when you make the change.
>
> **2026-10-14 — result of that check.** Three places must change with D10 (F7):
> - [types/api.ts:159](../../frontend/src/types/api.ts#L159) — `ScanResult` lists `'INVALID_PROCESS'`; also add `'INVALID_STATUS'`, which the endpoint can return but the type omits.
> - [mocks/handlers/lots.ts:32](../../frontend/src/mocks/handlers/lots.ts#L32) — the scan mock returns `INVALID_PROCESS`.
> - [ScanTag.tsx:48-52](../../frontend/src/pages/Assembly/ScanTag.tsx#L48-L52) — shows the raw code. Add a readable message for `INVALID_PROCESS_ORDER` ("wrong order — scan the previous station first").
>
> `CompletedResult` ([types/api.ts:158](../../frontend/src/types/api.ts#L158)) keeps `INVALID_PROCESS`.

**One guard-order change.** The reader SPs check `TAG_NOT_FOUND` before `INVALID_STATUS`; `completed` checks `INVALID_STATUS` first. The helper checks `INVALID_STATUS` first for all of them. The divergent case — an unknown tag scanned while the target master row is missing — cannot occur (those rows are seeded and FK-referenced), and both codes are silently skipped by the Python service. Note it in the commit message.

**A tag matching multiple lots.** `WHERE tag_id = @tag_id` on `tb_assy_lot` can match several rows once a tag has been reused — old completed lots keep their `tag_id`. The SP's `SELECT @var = ...` silently took an arbitrary one. Add `AND status_id != 4` to the lookup so it finds only the live pairing. **This is a real bug fix**, not a port artifact: without it, a reused tag can resolve to a completed lot and return `INVALID_PROCESS` forever. Cover it with a test that seeds one completed and one active lot on the same tag.

Unit tests: every branch of both functions; `UPDLOCK` present in the read; nothing written after a guard fires; the `status_id != 4` lookup filter.

**Concurrency test (integration, required).** Fire `enterGaugingRoomF1` twice concurrently for one tag with `Promise.all`; assert exactly one `OK`, one `INVALID_PROCESS`, and one `GAUGING_ROOM_F1` log row. Run it once with `UPDLOCK` removed to confirm the test actually catches the race, then restore it.

Verify with hardware if possible: register a lot, walk it past Reader 1 then Reader 2, watch the dashboard advance. Then walk a fresh tag past Reader 2 first and confirm it is silently ignored.

---

## Task 18: `processService` — completion and change-process (FLAG-2)

**Files:**
- Modify: `backend/services/processService.js`, its test
- Modify: `backend/routes/assembly.js:160-175`, `178-192`

Replaces `completed` and `change_process`.

**`completeLot` does not fit the `transition` helper** — it keys on `lot_no`, and it writes `tb_assy_tag` as well. Guard order: `INVALID_STATUS` (status 4 missing) → `LOT_NOT_FOUND` → `INVALID_PROCESS` → three writes.

> **2026-10-14 — the `INVALID_PROCESS` guard changed.** It is no longer `status_id != 3`. Since `alter_process_can_clear_tag.sql` it is: `status_id = 4` **or** the lot's status does not belong to a process with `can_clear_tag = 1`. Port that rule, not the old one.
>
> The Clear Tag page ([ClearTag.tsx:66-72](../../frontend/src/pages/Assembly/ClearTag.tsx#L66-L72), [:130-167](../../frontend/src/pages/Assembly/ClearTag.tsx#L130-L167)) now:
> - checks `can_clear_tag` itself before posting — a copy of the server rule. Keep the server rule as the authority; the FE check is only for a fast message.
> - lets the user pick a clearable process, but sends it **only inside `remark`** as `[FROM: <process_name>]`. The backend never sees a process id. If the audit trail needs "cleared from which process", add a `process_id` field to the request instead of parsing `remark`. See F8.
> - shows the raw code for any non-`OK` result (`:162`). Add messages for `INVALID_PROCESS` and the new `NO_TAG_PAIRED`.
> - never sends `machine_no`.

> The SP detected `LOT_NOT_FOUND` by selecting `tag_id` and testing it for null — so a lot that exists **with a null `tag_id`** also returned `LOT_NOT_FOUND`. `tb_assy_lot.tag_id` is nullable, so this is reachable. Query for the lot row itself and distinguish the two: a missing row is `LOT_NOT_FOUND`; an existing row with no tag is a new `NO_TAG_PAIRED` code. Add it to the frozen-contract table when you do — the frontend needs a message for it, and the Python service ignores unknown non-`OK` codes.

The tag write carries `AND status = 'active'`, matching the invariant from Task 14:

```sql
UPDATE tb_assy_tag SET status = 'cleared', cleared_at = GETDATE()
WHERE lot_no = @lot_no AND status = 'active'
```

**FLAG-2 — log failed clears, for admin-initiated attempts only:**

```js
const completeLot = (db, { lot_no, remark, emp_id, machine_no, source = 'ADMIN' }) =>
    db.transaction(async (tx) => {
        const fail = async (code) => {
            // Automated sources retry the same lot every cycle; logging those
            // would write thousands of rows a day per stuck lot. See FLAG-2 in
            // docs/plans/2026-09-03-backend-service-layer-refactor.md
            if (source === 'ADMIN') {
                await tx.query(
                    `INSERT INTO tb_assy_log (lot_no, tag_id, event_type, remark, emp_id)
                     VALUES (@lot_no, NULL, 'CLEAR_FAILED', @remark, @emp_id)`,
                    { lot_no, remark: code, emp_id: emp_id ?? null });
            }
            return { result: code };
        };
        // ... guards call `return fail('INVALID_PROCESS')` etc.
    });
```

Returning (rather than throwing) from the transaction callback commits, so the failure row survives — that is deliberate and worth a test.

`CLEAR_FAILED` fits `tb_assy_log.event_type` (`VARCHAR(50)`), and the reason code goes in `remark` (`VARCHAR(255)`). Add `CLEAR_FAILED` to the `event_type` list in `overview_diagram/02_er_diagram.mermaid` and README §5 as part of Task 22.

**`changeProcess`** — the admin override. No order enforcement by design, but four guards, and the SP re-queried `tb_assy_lot` three times. Read once. Guard order preserved: `TAG_NOT_FOUND` → `INVALID_STATUS` → `ALREADY_COMPLETED` → `SAME_STATUS` → update + `CHANGE_PROCESS` log row. Transaction with `UPDLOCK` like the others. It writes `remark` and `emp_id` onto `tb_assy_lot`, which the ordered transitions do not.

> `changeProcess` can move a lot **to** status 4. When it does it must also clear the tag row, or the pairing invariant breaks — the lot is completed but its tag stays `active` and can never be reused. The old SP did not do this. **This is a bug fix.** Either have `changeProcess` delegate to `completeLot` when `status_id === 4`, or duplicate the tag update. Delegating is cleaner; add a test for it.

Unit tests: every branch of both functions; the `CLEAR_FAILED` row is written for `source: 'ADMIN'` and not for `source: 'POLLING'`; `changeProcess` to status 4 clears the tag.

Verify: Clear Tag page end to end, including a deliberate failure (clear a lot at status 1) and confirming the `CLEAR_FAILED` row appears. Then the admin override path, including an override to Completed followed by reusing that tag on a new lot.

> **2026-10-14:** no page calls `POST /change-process` (grep of `frontend/src` is empty). The admin override exists only as a Bruno request (`bruno/AYT-RFID/Lot - Change Process.yml`). Verify it through Bruno. The Cutover table's "recover via admin Change Process" also means Bruno, not the UI. The "deliberate failure" step above cannot be done from the browser any more: the FE `can_clear_tag` check stops the request before it reaches the backend. Test that branch with Bruno too.

---

## Task 19: Fix D7 — reader config paths

**Files:**
- Create: `backend/services/readerConfigService.js`
- Modify: `backend/routes/assembly.js:228`, `237`, `393` (line numbers as of 2026-10-14: `GET /readers-config`, `PUT /readers-config`, `GET /dashboard/locations`)

`fs.readFileSync('../service/reader_config.json')` resolves against the process CWD, so the server only works when launched from `backend/`. Use `path.join(__dirname, '..', '..', 'service', 'reader_config.json')`.

Move all three accesses into `readerConfigService.js` exporting `readConfig()`, `writeConfig(config)`, `listLocations()`. Fourth consumer of that path — extraction is overdue.

> `writeConfig` writes whatever the request body contains with no validation. A malformed write breaks the Python service on its next restart. Out of scope here; raised in Task 22.

Verify: start from the repository root (`node backend/server.js`) and confirm Management → Reader Config loads. That fails today.

---

## Task 20: Add the missing indexes

**Files:**
- Create: `backend/backup_DB_SP/add_indexes.sql`

The service layer issues more, smaller queries than the SPs did — `processService` reads `tb_assy_lot` by `tag_id` before every write. `IX_assy_lot_tag` exists. These do not:

```sql
CREATE INDEX IX_assy_log_lot    ON tb_assy_log(lot_no)
CREATE INDEX IX_assy_tag_lot    ON tb_assy_tag(lot_no)
CREATE INDEX IX_assy_api_log_ts ON tb_assy_api_log(created_at)
```

`IX_assy_tag_lot` matters more after Task 18, which looks up tag rows by `lot_no` on every completion. Already recommended in `overview_diagram/README.md` §14.

Present for approval; do not run automatically.

---

## Task 21: Retire the stored procedures

**Files:**
- Create: `backend/backup_DB_SP/drop_retired_sps.sql`

**Do not run until Tasks 4-18 have run in the real environment for at least a week.** A dropped SP needs a restore to recover; leaving it costs nothing.

**Step 1: Confirm nothing calls them**

Run: `cd backend && grep -rn "\.execute(" routes/ server.js services/`
Expected: no matches. Any match is an unported call site.

**Step 2: Write the drop script**

```sql
USE [db_rfid_assembly]
GO
-- Retired by the service-layer refactor.
-- See docs/plans/2026-09-03-backend-service-layer-refactor.md
-- Definitions remain in backend/backup_DB_SP/ and in git history.
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_in_assy;            -- dead before this refactor
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_wip_gauging;        -- dead before this refactor
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_mock_as400_select;  -- dead before this refactor
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_api_log_insert;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_mock_done_select;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_mock_done_insert;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_mock_done_delete;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_master_assy_status_select;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_master_assy_status_insert;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_master_assy_status_update;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_master_assy_status_delete;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_master_process_select;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_master_process_insert;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_master_process_update;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_master_process_delete;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_login_verify;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_login_select;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_login_insert;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_login_update;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_login_delete;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_dashboard;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_dashboard_history;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_dashboard_process_summary;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_clear_tag_history;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_lot_by_tag;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_register;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_gauging_room_f1;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_mc_gauging_f1;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_completed;
DROP PROCEDURE IF EXISTS dbo.Stored_tb_assy_change_process;
GO
```

Present for approval before executing — destructive schema change.

---

## Task 22: Update the documentation

**Files:**
- Modify: `overview_diagram/README.md`, `overview_diagram/SYSTEM_OVERVIEW.md`, `overview_diagram/02_er_diagram.mermaid`, `overview_diagram/03_architecture.mermaid`

The docs describe an SP-based system that will no longer exist. Also stale before this refactor:

- §4 and §17 reference a `diagrams/` folder with six mermaid files; the real folder is `overview_diagram/` with three (`04_python_service_flow`, `05_auth_flow`, `06_polling_flow` do not exist). §14 cross-references the missing `06_polling_flow.mermaid`.
- §4 names the repo root `RFID_AYT_ASSY/`; the checkout is `RFID_Assembly`.
- Footer says "Last updated: August 2026" — predates the last two commits.

Changes this refactor requires:

- **§7 Stored Procedures** — replace with a service-module table.
- **§5** and `02_er_diagram.mermaid` — add `CLEAR_FAILED` to the `event_type` list; document `UX_assy_tag_active` and the one-active-pairing-per-tag rule.
- **§12 Known Issues** — remove plaintext passwords (fixed, Task 9); remove the "no automated tests" line from §13.
- **§6 API Endpoints** — mark which return HTTP status codes vs `{result}`, per the contract boundary.
- **§15** — note bcrypt hashing.
- **SYSTEM_OVERVIEW.md** — the "Data written at each step" table still describes SP behaviour; update the Completed rows for the `CLEAR_FAILED` path.

---

## Frontend impact — Assembly pages (reviewed 2026-10-14)

Every page in `frontend/src/pages/Assembly/`, the endpoints it calls, and where that endpoint goes. Use this table when the redesign reaches B7 (FE switch).

| Page | Endpoint(s) | Contract | Old task | Redesign branch |
|---|---|---|---|---|
| `Register.tsx`, `RegisterSingle.tsx` | `GET /lot/:lot_no`, `POST /register-tag` | 404 / frozen `{result}` | 4, 16 | B2.4, B2.5 |
| `ScanTag.tsx` | `POST /gauging-room-f1`, `/mc-gauging-f1` | frozen `{result}` | 17 | B3.2 |
| `ClearTag.tsx` — Clear | `GET /status`, `/process`, `/lot-by-lot/:lot_no`, `/lot-by-tag/:tag_id`, `POST /completed` | CRUD / 404 / frozen | 6, 7, 16, 18 | B1, B5.1, B4.2 |
| `ClearTag.tsx` — History | `GET /clear-tag/history` | list | 12 | B5.2 |
| `Dashboard.tsx` | `GET /dashboard`, `/dashboard/process-summary`, `/dashboard/history`, `/dashboard/locations`, `/dashboard/daily-inventory` | list | 12, 13, 19 | B5.2, B5.4 |
| `Management/StatusTab.tsx` | `/status` CRUD | CRUD | 6, 10 | B1.4 |
| `Management/ProcessTab.tsx` | `/process` CRUD | CRUD | 7, 10 | B1.2 |
| `Management/UserTab.tsx` | `/login/users` CRUD | CRUD | 8, 10 | B6 (deferred) |
| `MockDone.tsx` | `/mock-done` list / add / delete | CRUD | 5, 10 | B4.1 |
| `ReaderConfig.tsx` | `GET /status`, `/readers-config`, `/readers-status`, `PUT /readers-config`, `POST /readers-restart` | CRUD | 19 | not covered (roadmap O2) |
| `dailyInventory.ts`, `processBreakdown.ts` | — (pure helpers, unit-tested) | — | — | B5.4 response shape must keep `inventory_qty` non-null |

Any contract change also touches `frontend/src/types/api.ts` and `frontend/src/mocks/handlers/*` (mock mode must keep working), and the matching file in `bruno/AYT-RFID/`.

### Findings

| # | Finding | Where | Status |
|---|---|---|---|
| F1 | `can_clear_tag` is not read or written by `masterService` process functions. On the real backend the ProcessTab checkbox is lost on save, `GET /process` has no `can_clear_tag`, so Clear Tag's clearable list is always empty and **every clear is blocked in the UI**. Works only in mock mode. | `backend/services/masterService.js:36-56`; FE `ClearTag.tsx:69-70`, `ProcessTab.tsx:81-82` | [ ] Not started — fix now if the old backend must run before B1; else B1.2 covers it |
| F2 | `search` on Clear Tag History is ignored by the route — SP has `@search`, route does not bind it. | `backend/routes/assembly.js:404-417` | [ ] Not started — same choice as F1; B5.2 covers it |
| F3 | Management tabs show a **success** toast for SQL errors, because the backend returns `200 {result:'<SQL text>'}` and the tabs treat any 2xx as success. | `Management/*.tsx` (e.g. `ProcessTab.tsx:29-41`) | [-] DEFERRED — fixed by B0.2 error handler + B1 status codes. Resume in B7: show `err.response.data.message` in each `catch` |
| F4 | `GET /dashboard/daily-inventory` has a page, a mock and a Bruno request, but no backend route. | `Dashboard.tsx:133`, `mocks/handlers/dashboard.ts:91` | [-] DEFERRED — B5.4 `/dashboard/inventory` must cover it. Resume: map its response to `DailyInventoryRow` |
| F5 | `top5` / `Top5Row` still in type and mock; no page uses it. | `types/api.ts:55, 70`, `mocks/handlers/dashboard.ts:39, 64` | [-] DEFERRED — delete in B7 when `DashboardResponse` changes |
| F6 | MockDone delete ignores the `NOT_FOUND` result added in Task 5; errors only go to `console.error`. | `MockDone.tsx:62-69` | [-] DEFERRED — B4.1 replaces mock-done; resume there |
| F7 | D10 rename touches the FE too: `ScanResult` type, scan mock, ScanTag message. `ScanResult` also misses `INVALID_STATUS`. | `types/api.ts:159`, `mocks/handlers/lots.ts:32`, `ScanTag.tsx:48-52` | [-] DEFERRED — B3.2 defines new scan codes; resume in B7 |
| F8 | Clear Tag sends the chosen process only inside `remark` text; no `process_id`, no `machine_no`. | `ClearTag.tsx:152-157` | [-] DEFERRED — decide in B4.2 whether manual clear takes `process_id` |
| F9 | No page calls `POST /change-process`. Admin override is Bruno-only. | grep `frontend/src` | [-] DEFERRED — redesign B3.2 deletes `/change-process`; confirm no UI is wanted |

---

## Follow-ups — raise, do not do

1. **FLAG-1 — dashboard semantics.** Confirm with the line supervisors what the four cards should count, now that the numbers are internally consistent and the code is readable.
2. **FLAG-2 — clear-failure logging for automated sources.** Revisit if the audit trail needs them; needs a dedupe rule and the cleanup job first.
3. **`writeConfig` has no validation** (Task 19). A malformed PUT breaks the Python service on next restart.
4. **`tb_assy_log` growth.** No cleanup job. `overview_diagram/README.md` §14 has the DELETE statements. Now more pressing — `CLEAR_FAILED` adds rows.
5. **Session management.** No timeout, no JWT; `sessionStorage` only. README §12.
6. **`console.log` removal before production.** README §12.
7. **The polling loop** (D1). When the AS400 version is written it should call `processService.completeLot(db, {..., source: 'POLLING'})`, not inline SQL.
8. **Python retry and queue** (D11). The highest-value item on this list. Removes the "restart only when the line is stopped" constraint and protects against unplanned backend outages, not just deliberate ones. Move the `seen_tags` cooldown write to after a successful POST while you are there.

---

## Cutover — when it is safe to restart the backend

**Restart the backend only while the conveyor line is stopped.** This is not a precaution about the refactor; it is a standing property of the system.

The Python service has no retry. [main_assy.py:64-92](../../service/main_assy.py#L64-L92) posts each scan once, and on any exception prints the error and drops it. Worse, the tag is written into `seen_tags` with the 10-second cooldown at [line 59](../../service/main_assy.py#L59) **before** the POST is attempted, so the same tag will not be re-sent for 10 seconds — by which time the lot has moved past the reader.

Node restarts in one to two seconds. The scan window as a lot passes a reader is about the same. **Every tag scanned during a restart is lost permanently**, and the lot silently stays at its previous status.

| When | Action |
|---|---|
| Line stopped (shift change, lunch, end of day) | Deploy freely |
| Line running | Do not restart, for any task in this plan |
| A lot is discovered stuck at the wrong status | Recover via admin Change Process — it records `emp_id` and `remark`, so the correction is auditable |

**Python does not need redeploying for any task in this plan.** Its HTTP contract is unchanged apart from D10, which makes a previously-dead branch start working — it needs no code change to benefit.

**Follow-up worth doing on its own merits (D11):** give the Python service a retry with a small on-disk queue, and move the `seen_tags` cooldown write to *after* a successful POST. That removes the restart constraint entirely and protects against any backend hiccup, not just deliberate ones. It touches the frozen client, so it needs its own testing window on the OT machine.

---

## Rollback

Every phase is independently revertable because the SPs are not dropped until Task 21.

- **A service misbehaves:** `git revert` the task's commit. The SP is still in the database and the reverted route calls it again. No database change needed.
- **After Task 21 has run:** re-create the SP from `backend/backup_DB_SP/` (or git history if the UTF-16 file is unreadable), then revert.
- **Schema changes are not revertable by git.** Tasks 9 (column width), 14 (index), 20 (indexes) need their own down-scripts if reverted. Task 14 also **deletes** the contents of `tb_assy_log`, `tb_assy_tag`, and `tb_assy_lot` — not reversible without a backup. Take one first, even on dev.
- **Task 2's fix should not be reverted** — it corrects a statement that always fails.

---

## Questions — answered 2026-09-03

| Question | Answer | Effect on the plan |
|---|---|---|
| Is there a non-production copy of the database? | Not yet; a separate dev/test database is wanted | **Task 1 now creates `db_rfid_assembly_dev`** and makes `database.js` env-driven. Phase 5 is unblocked |
| Is Mock Done still wanted? | Yes for now; the AS400 API is integrated later | Task 5 ports it as written. Revisit when D1 is implemented |
| Can the Python service be restarted during cutover? | Asked for alternatives | **See the Cutover section.** Python needs no redeploy; the constraint is on *backend* restarts, and it is stricter than expected — see D11 |
| Does anything outside this repo call these SPs? | No | Task 21 is safe once the in-repo grep is clean |
| Do the `backup_DB_SP/` scripts match what is live? | Confirmed: nothing exists in SSMS beyond that folder | **Closed.** The committed scripts are the authoritative set; Phase 5 ports from them |
| How far has the tag data drifted? | No real data yet | **Task 14 no longer backfills** — it clears the test rows and creates the constraint |
| Is `backend/.env` gitignored? | Yes — `.gitignore:2` | **Closed.** Verified 2026-09-03. `backend/.env.example` created and ready to commit |

### Nothing blocking remains

Every decision needed to start Phase 0 has been made. The two items below are **deliberately deferred** — they are product questions that can only be answered once the corrected behaviour is visible, not blockers.

- **FLAG-1** (Task 13) — what the four dashboard summary cards should count. Recap with the user after Phase 4, when the numbers are internally consistent and the query is readable.
- **FLAG-2** (Task 18) — whether automated sources should also write `CLEAR_FAILED` rows. Revisit if the audit trail turns out to need them; needs a dedupe rule and the log cleanup job first.
