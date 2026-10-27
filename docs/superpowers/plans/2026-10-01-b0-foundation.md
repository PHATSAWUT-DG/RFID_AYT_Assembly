# B0 Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` to implement this plan task by task, **inline in the main session**. Never use subagents (user rule). Steps use checkbox (`- [ ]`) syntax. After each task: stop, show the diff, wait for the user's review. Never run `git add` / `git commit`; list the files and suggest a commit message instead.

**Goal:** Give the backend the shared base that B1–B5 build on: lazy DB pool, typed errors, zod validation, SQL error helpers, and an `app.js` / `server.js` split that is testable without a database.

**Architecture:** `app.js` exports `createApp({ apiRouter, logger })` and never listens; `server.js` loads env, wires the real router and listens. Errors flow as `AppError` to one error handler that returns `{ error, message, details? }`. `database.js` connects on first use, so `require` never opens a DB connection and unit tests stay offline.

**Tech Stack:** Node 22 (CommonJS), Express 5.2, mssql 12, zod 4, `node:test` + `node:assert`.

**Spec:** `docs/superpowers/specs/2026-10-01-backend-redesign-design.md` (sections 6, 9, 10). Roadmap: `docs/superpowers/plans/2026-10-01-backend-redesign-roadmap.md`.

## Global Constraints

- Express 5: rejected promises reach the error handler on their own. No `asyncHandler` wrapper.
- Error body: `{ "error": "<CODE>", "message": "<text>", "details"?: {...} }`. Unknown errors → 500 `INTERNAL`, logged with stack, no internals in the body.
- API base stays `/api/assembly`. No `/v2`.
- No stored procedures. Layers: route → controller → service → repository.
- Only new dependency in B0: `zod` (v4).
- Express 5 makes `req.query` a read-only getter. Parsed input goes to `req.valid`, never back onto `req.query`.
- Tests: only unit tests with fakes. Nothing may connect to a real DB or API. Before Task 1 is done, run single test files only — the current `npm test` loads `database.js`, which opens a real DB connection at `require` time.
- Bruno: no endpoint changes in B0, so no Bruno changes.

## Review Focus

1. **Malformed JSON body** (reader or FE sends broken JSON) → 400 `VALIDATION_ERROR` JSON, not 500. Pinned in Task 2 and Task 4.
2. **Body over the 100 kb JSON limit** → 413 JSON body, not an HTML page. Pinned in Task 2.
3. **Old FE calls a route that no longer exists** (R7, until B7) → 404 JSON `ROUTE_NOT_FOUND`, not Express's HTML "Cannot GET". Pinned in Task 4.
4. **POST with no body or no `Content-Type`** → Express 5 leaves `req.body` undefined → must be a 400 `VALIDATION_ERROR`, not a `TypeError` 500. Pinned in Task 3.
5. **DB down when the server starts** → server still starts; a request fails with 500 `INTERNAL`; the next request tries to connect again (today the pool promise resolves to `undefined` forever). Pinned in Task 1.

---

## File map

| File | Status | Duty |
| --- | --- | --- |
| `backend/database.js` | Modify | Pool config + lazy `getPool()` (connect on first call, retry after failure) |
| `backend/db.js` | Modify | Use `getPool()` |
| `backend/routes/assembly.js` | Modify | `poolPromise` → `getPool()` (mechanical; file is deleted bit by bit in B1–B5) |
| `backend/scripts/rehash_passwords.js` | Modify | `poolPromise` → `getPool()` |
| `backend/shared/AppError.js` | Create | `AppError(code, httpStatus, message, details?)` |
| `backend/shared/errorHandler.js` | Create | `createErrorHandler({ logger })` |
| `backend/shared/validate.js` | Create | `validate({ params, query, body })` zod middleware → `req.valid` |
| `backend/shared/sqlErrors.js` | Create | `isUniqueViolation(err)`, `getUniqueViolationName(err)` |
| `backend/app.js` | Create | `createApp({ apiRouter, logger })` |
| `backend/server.js` | Modify | dotenv + `createApp` + `listen`; old polling removed |
| `backend/test/helpers/startApp.js` | Create | Start an app on a random port for HTTP tests |
| `backend/test/unit/database.test.js` | Create | Lazy pool tests |
| `backend/test/unit/shared/errorHandler.test.js` | Create | |
| `backend/test/unit/shared/validate.test.js` | Create | |
| `backend/test/unit/shared/sqlErrors.test.js` | Create | |
| `backend/test/unit/app.test.js` | Create | App wiring over real HTTP with a fake router |

## Task status

| # | Task | Model / effort | Status |
| --- | --- | --- | --- |
| 1 | Lazy DB pool | Sonnet 5, medium | [x] `database.js:15` lazy `getPool`; callers in `db.js`, `routes/assembly.js`, `scripts/rehash_passwords.js`; test `test/unit/database.test.js` (3/3), `npm test` 33/33 |
| 2 | `AppError` + error handler | Sonnet 5, medium | [x] `shared/AppError.js`, `shared/errorHandler.js`; test `test/unit/shared/errorHandler.test.js` (7/7), `npm test` 40/40 |
| 3 | `validate` (zod) + `sqlErrors` | Sonnet 5, medium | [x] `shared/validate.js`, `shared/sqlErrors.js`, zod `^4.6.7` in `package.json:20`; tests 8/8, `npm test` 48/48 |
| 4 | `app.js` / `server.js` split + JSON 404 + `startApp` helper | Sonnet 5, medium | [x] `app.js`, `server.js`, `test/helpers/startApp.js`, `test/unit/app.test.js` (6/6), `npm test` 54/54, spec row added. Smoke test 2026-10-27: user ran `node server.js`, starts with no error; `curl` to an unknown route returns `404` `{"error":"ROUTE_NOT_FOUND",...}` |

Where: one new session (Sonnet 5, medium) for all four tasks.

---

### Task 1: Lazy DB pool

**Why:** `database.js` connects when it is first `require`d. So any unit test that loads `db.js` (today: `test/unit/db.test.js`) opens a real DB connection, which breaks the "unit tests stay offline" rule. Also, a failed connect is caught and the promise resolves to `undefined` forever, so every later query fails with a confusing `TypeError` and the server never retries.

**Files:**
- Modify: `backend/database.js` (whole file)
- Modify: `backend/db.js:1`, `backend/db.js:24`, `backend/db.js:31`
- Modify: `backend/routes/assembly.js:4` and every `await poolPromise` line (`:67, :83, :101, :121, :136, :151, :169, :342, :364, :382, :407`; the commented lines `:186`, `:199` too)
- Modify: `backend/scripts/rehash_passwords.js:6`, `:11`
- Test: `backend/test/unit/database.test.js`

**Interfaces:**
- Produces: `database.js` exports `{ sql, getPool, createPoolGetter }`.
  - `getPool(): Promise<ConnectionPool>` — connects on the first call, returns the same pool after that, and starts again from zero after a failed connect.
  - `createPoolGetter({ ConnectionPool, config }): () => Promise<pool>` — the testable factory.
- `db.js` public API is unchanged: `{ query, transaction, typed, inferSqlType, sql }`.

- [ ] **Step 1: Write the failing test**

Create `backend/test/unit/database.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { createPoolGetter } = require('../../database');

function fakePoolClass(connectResults) {
    const created = [];
    class FakePool {
        constructor(config) {
            this.config = config;
            created.push(this);
        }
        connect() {
            const next = connectResults.shift();
            return next instanceof Error ? Promise.reject(next) : Promise.resolve(this);
        }
    }
    return { FakePool, created };
}

test('getPool does not connect until it is called', () => {
    const { FakePool, created } = fakePoolClass([]);
    createPoolGetter({ ConnectionPool: FakePool, config: {} });
    assert.strictEqual(created.length, 0);
});

test('getPool connects once and reuses the pool', async () => {
    const { FakePool, created } = fakePoolClass(['ok']);
    const getPool = createPoolGetter({ ConnectionPool: FakePool, config: { database: 'x' } });
    const [a, b] = await Promise.all([getPool(), getPool()]);
    assert.strictEqual(a, b);
    assert.strictEqual(created.length, 1);
    assert.deepStrictEqual(created[0].config, { database: 'x' });
});

test('getPool rejects on a failed connect, then retries on the next call', async () => {
    const { FakePool, created } = fakePoolClass([new Error('db down'), 'ok']);
    const getPool = createPoolGetter({ ConnectionPool: FakePool, config: {} });
    await assert.rejects(getPool(), /db down/);
    const pool = await getPool();
    assert.strictEqual(pool, created[1]);
    assert.strictEqual(created.length, 2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (in `backend/`): `node --test test/unit/database.test.js`
Expected: FAIL — `createPoolGetter is not a function`.
Do **not** run `npm test` yet: it loads the old `database.js`, which connects to the real DB.

- [ ] **Step 3: Rewrite `backend/database.js`**

```js
const sql = require('mssql');

const dbConfig = {
    server: process.env.DB_SERVER || 'PBSY70\\SQLEXPRESS',
    port: Number(process.env.DB_PORT) || 1433,
    database: process.env.DB_NAME || 'db_rfid_assembly',
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    options: {
        encrypt: true,
        trustServerCertificate: true
    }
};

// Connect on first use, not at require time, so loading this module (e.g. in
// unit tests) never opens a DB connection. A failed connect is not cached:
// the next call tries again.
function createPoolGetter({ ConnectionPool = sql.ConnectionPool, config }) {
    let poolPromise = null;
    return function getPool() {
        if (!poolPromise) {
            poolPromise = new ConnectionPool(config).connect().catch((err) => {
                poolPromise = null;
                throw err;
            });
        }
        return poolPromise;
    };
}

const getPool = createPoolGetter({ config: dbConfig });

module.exports = { sql, getPool, createPoolGetter };
```

The config defaults are kept as they are (no behavior change in this task; see "Discovered issues" at the end).

- [ ] **Step 4: Switch the callers to `getPool()`**

`backend/db.js`:
- Line 1: `const { sql, poolPromise } = require('./database');` → `const { sql, getPool } = require('./database');`
- Lines 24 and 31: `const pool = await poolPromise;` → `const pool = await getPool();`

`backend/routes/assembly.js`:
- Line 4: `const { sql, poolPromise } = require('../database');` → `const { sql, getPool } = require('../database');`
- Every `const pool = await poolPromise;` (active and commented) → `const pool = await getPool();`

`backend/scripts/rehash_passwords.js`:
- Line 6: `const { poolPromise, sql } = require('../database');` → `const { getPool, sql } = require('../database');`
- Line 11: `const pool = await poolPromise;` → `const pool = await getPool();`

Check that nothing is left (expect no output outside `server.js`, which Task 4 rewrites):

Run (repo root): `git grep -n "poolPromise" -- backend ":!backend/node_modules"`
Expected: only `backend/database.js` (the local variable) and `backend/server.js` lines.

- [ ] **Step 5: Run the tests**

Run (in `backend/`): `node --test test/unit/database.test.js`
Expected: 3 pass.

Now `npm test` is safe (nothing connects at `require` time):
Run (in `backend/`): `npm test`
Expected: all pass, including the existing `db.test.js`, `masterService.test.js`, etc. No "Connection error" lines in the output.

- [ ] **Step 6: Hand off for review**

Light self-check of the diff against `agents/code-reviewer.md`. Show the diff. Suggested commit:
`refactor(backend): connect DB pool on first use and retry after failure`

---

### Task 2: `AppError` + error handler

**Files:**
- Create: `backend/shared/AppError.js`
- Create: `backend/shared/errorHandler.js`
- Test: `backend/test/unit/shared/errorHandler.test.js`

**Interfaces:**
- Produces:
  - `new AppError(code: string, httpStatus: number, message: string, details?: any)` — `instanceof Error`, fields `code`, `httpStatus`, `details`.
  - `createErrorHandler({ logger = console } = {}) → (err, req, res, next)` Express error middleware.
    - `AppError` → `res.status(httpStatus).json({ error: code, message, details? })` (`details` only when defined).
    - body-parser `entity.parse.failed` → 400 `VALIDATION_ERROR`.
    - body-parser `entity.too.large` → 413 `VALIDATION_ERROR`.
    - anything else → `logger.error(...)` + 500 `{ error: 'INTERNAL', message: 'Internal server error' }`.
    - headers already sent → `next(err)` (Express closes the connection).

- [ ] **Step 1: Write the failing test**

Create `backend/test/unit/shared/errorHandler.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { AppError } = require('../../../shared/AppError');
const { createErrorHandler } = require('../../../shared/errorHandler');

function fakeRes() {
    return {
        statusCode: 200,
        body: undefined,
        headersSent: false,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; return this; },
    };
}

function fakeLogger() {
    const errors = [];
    return { errors, error: (...args) => errors.push(args) };
}

const req = { method: 'POST', originalUrl: '/api/assembly/pairings' };

test('AppError is an Error with code, status and details', () => {
    const err = new AppError('TAG_IN_USE', 409, 'Tag is in use', { lot_no: 'L1' });
    assert.ok(err instanceof Error);
    assert.strictEqual(err.code, 'TAG_IN_USE');
    assert.strictEqual(err.httpStatus, 409);
    assert.strictEqual(err.message, 'Tag is in use');
    assert.deepStrictEqual(err.details, { lot_no: 'L1' });
});

test('AppError becomes its status and { error, message, details }', () => {
    const res = fakeRes();
    createErrorHandler({ logger: fakeLogger() })(
        new AppError('TAG_IN_USE', 409, 'Tag is in use', { lot_no: 'L1' }), req, res, () => {});
    assert.strictEqual(res.statusCode, 409);
    assert.deepStrictEqual(res.body, { error: 'TAG_IN_USE', message: 'Tag is in use', details: { lot_no: 'L1' } });
});

test('AppError without details has no details key', () => {
    const res = fakeRes();
    createErrorHandler({ logger: fakeLogger() })(
        new AppError('LOT_NOT_FOUND', 404, 'Lot not found'), req, res, () => {});
    assert.deepStrictEqual(res.body, { error: 'LOT_NOT_FOUND', message: 'Lot not found' });
});

test('malformed JSON body becomes 400 VALIDATION_ERROR', () => {
    const res = fakeRes();
    const err = Object.assign(new SyntaxError('Unexpected token'), { type: 'entity.parse.failed', status: 400 });
    createErrorHandler({ logger: fakeLogger() })(err, req, res, () => {});
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(res.body.error, 'VALIDATION_ERROR');
});

test('body over the size limit becomes 413 JSON', () => {
    const res = fakeRes();
    const err = Object.assign(new Error('request entity too large'), { type: 'entity.too.large', status: 413 });
    createErrorHandler({ logger: fakeLogger() })(err, req, res, () => {});
    assert.strictEqual(res.statusCode, 413);
    assert.strictEqual(res.body.error, 'VALIDATION_ERROR');
});

test('unknown error is logged and hidden behind 500 INTERNAL', () => {
    const res = fakeRes();
    const logger = fakeLogger();
    createErrorHandler({ logger })(new Error('Login failed for user sa'), req, res, () => {});
    assert.strictEqual(res.statusCode, 500);
    assert.deepStrictEqual(res.body, { error: 'INTERNAL', message: 'Internal server error' });
    assert.strictEqual(logger.errors.length, 1);
    assert.match(String(logger.errors[0][0]), /POST \/api\/assembly\/pairings/);
});

test('headers already sent: passes the error on to Express', () => {
    const res = { ...fakeRes(), headersSent: true };
    const err = new Error('late');
    let passed;
    createErrorHandler({ logger: fakeLogger() })(err, req, res, (e) => { passed = e; });
    assert.strictEqual(passed, err);
    assert.strictEqual(res.body, undefined);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (in `backend/`): `node --test test/unit/shared/errorHandler.test.js`
Expected: FAIL — `Cannot find module '../../../shared/AppError'`.

- [ ] **Step 3: Write `backend/shared/AppError.js`**

```js
class AppError extends Error {
    constructor(code, httpStatus, message, details) {
        super(message);
        this.name = 'AppError';
        this.code = code;
        this.httpStatus = httpStatus;
        this.details = details;
    }
}

module.exports = { AppError };
```

- [ ] **Step 4: Write `backend/shared/errorHandler.js`**

```js
const { AppError } = require('./AppError');

// Error types set by express.json() (body-parser) for bad client input.
const BODY_PARSER_ERRORS = {
    'entity.parse.failed': { status: 400, message: 'Request body is not valid JSON' },
    'entity.too.large': { status: 413, message: 'Request body is too large' },
};

function createErrorHandler({ logger = console } = {}) {
    // Express detects error middleware by its 4 parameters, so `next` must stay.
    return (err, req, res, next) => {
        if (res.headersSent) return next(err);

        if (err instanceof AppError) {
            const body = { error: err.code, message: err.message };
            if (err.details !== undefined) body.details = err.details;
            return res.status(err.httpStatus).json(body);
        }

        const bodyError = BODY_PARSER_ERRORS[err.type];
        if (bodyError) {
            return res.status(bodyError.status).json({ error: 'VALIDATION_ERROR', message: bodyError.message });
        }

        logger.error(`[${req.method} ${req.originalUrl}]`, err);
        return res.status(500).json({ error: 'INTERNAL', message: 'Internal server error' });
    };
}

module.exports = { createErrorHandler };
```

- [ ] **Step 5: Run the tests**

Run (in `backend/`): `node --test test/unit/shared/errorHandler.test.js`
Expected: 7 pass.
Run (in `backend/`): `npm test`
Expected: all pass. (`test/unit/**/*.test.js` picks up the new `shared/` folder.)

- [ ] **Step 6: Hand off for review**

Light self-check. Show the diff. Suggested commit:
`feat(backend): add AppError and central JSON error handler`

---

### Task 3: `validate` (zod) + `sqlErrors`

**Files:**
- Modify: `backend/package.json`, `backend/package-lock.json` (via `npm install`)
- Create: `backend/shared/validate.js`
- Create: `backend/shared/sqlErrors.js`
- Test: `backend/test/unit/shared/validate.test.js`
- Test: `backend/test/unit/shared/sqlErrors.test.js`

**Interfaces:**
- Consumes: `AppError` from Task 2.
- Produces:
  - `validate({ params?, query?, body? }) → (req, res, next)` middleware. Each value is a zod schema. On success: `req.valid = { params?, query?, body? }` with the **parsed** values (coerced, defaults applied). On failure: `next(new AppError('VALIDATION_ERROR', 400, 'Request validation failed', details))` with `details = [{ in: 'params'|'query'|'body', path: 'a.b.0', message }]`. Parts with no schema are not copied to `req.valid`.
  - `isUniqueViolation(err) → boolean` — SQL Server error 2601 or 2627.
  - `getUniqueViolationName(err) → string | null` — the index / constraint name from the error message (B2 maps `UX_pairing_active_tag` → `TAG_IN_USE`, `UX_pairing_active_lot` → `LOT_ALREADY_PAIRED`).

- [ ] **Step 1: Add zod**

Run (in `backend/`): `npm install zod@^4`
Expected: `package.json` `dependencies` gains `"zod": "^4.x.x"`. (Installs from the public npm registry only; no project DB or API is touched.)

- [ ] **Step 2: Write the failing tests**

Create `backend/test/unit/shared/validate.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { z } = require('zod');
const { validate } = require('../../../shared/validate');
const { AppError } = require('../../../shared/AppError');

function run(middleware, req) {
    let nextArg = 'not called';
    middleware(req, {}, (arg) => { nextArg = arg; });
    return nextArg;
}

test('valid input: parsed values go to req.valid and next() gets no error', () => {
    const mw = validate({
        params: z.object({ id: z.coerce.number().int().positive() }),
        query: z.object({ page: z.coerce.number().int().default(1) }),
        body: z.object({ lot_no: z.string().min(1) }),
    });
    const req = { params: { id: '7' }, query: {}, body: { lot_no: 'L1' } };
    const nextArg = run(mw, req);
    assert.strictEqual(nextArg, undefined);
    assert.deepStrictEqual(req.valid, { params: { id: 7 }, query: { page: 1 }, body: { lot_no: 'L1' } });
});

test('req.query is never written (Express 5 makes it read-only)', () => {
    const mw = validate({ query: z.object({ page: z.coerce.number() }) });
    const query = { page: '2' };
    const req = { query };
    run(mw, req);
    assert.strictEqual(req.query, query);
    assert.deepStrictEqual(req.valid.query, { page: 2 });
});

test('invalid input: one VALIDATION_ERROR listing issues from every part', () => {
    const mw = validate({
        params: z.object({ id: z.coerce.number().int().positive() }),
        body: z.object({ lot_no: z.string().min(1), tag_codes: z.array(z.string().min(1)) }),
    });
    const req = { params: { id: 'abc' }, body: { lot_no: '', tag_codes: ['ok', ''] } };
    const err = run(mw, req);
    assert.ok(err instanceof AppError);
    assert.strictEqual(err.code, 'VALIDATION_ERROR');
    assert.strictEqual(err.httpStatus, 400);
    const where = err.details.map((d) => `${d.in}:${d.path}`).sort();
    assert.deepStrictEqual(where, ['body:lot_no', 'body:tag_codes.1', 'params:id']);
    assert.ok(err.details.every((d) => typeof d.message === 'string' && d.message.length > 0));
    assert.strictEqual(req.valid, undefined);
});

test('missing body (Express 5 leaves req.body undefined) is a validation error, not a crash', () => {
    const mw = validate({ body: z.object({ lot_no: z.string() }) });
    const err = run(mw, { params: {}, query: {} });
    assert.ok(err instanceof AppError);
    assert.strictEqual(err.code, 'VALIDATION_ERROR');
});
```

Create `backend/test/unit/shared/sqlErrors.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { isUniqueViolation, getUniqueViolationName } = require('../../../shared/sqlErrors');

const sqlError = (number, message) => Object.assign(new Error(message), { number });

const duplicateIndex = sqlError(2601,
    "Cannot insert duplicate key row in object 'dbo.tb_assy_pairing' with unique index 'UX_pairing_active_tag'. The duplicate key value is (5).");
const duplicateConstraint = sqlError(2627,
    "Violation of UNIQUE KEY constraint 'UQ_assy_tag_code'. Cannot insert duplicate key in object 'dbo.tb_assy_tag'. The duplicate key value is (T1).");

test('isUniqueViolation: true for 2601 and 2627', () => {
    assert.strictEqual(isUniqueViolation(duplicateIndex), true);
    assert.strictEqual(isUniqueViolation(duplicateConstraint), true);
});

test('isUniqueViolation: false for other errors', () => {
    assert.strictEqual(isUniqueViolation(sqlError(547, 'FK conflict')), false);
    assert.strictEqual(isUniqueViolation(new Error('plain')), false);
    assert.strictEqual(isUniqueViolation(undefined), false);
});

test('getUniqueViolationName reads the index or constraint name', () => {
    assert.strictEqual(getUniqueViolationName(duplicateIndex), 'UX_pairing_active_tag');
    assert.strictEqual(getUniqueViolationName(duplicateConstraint), 'UQ_assy_tag_code');
});

test('getUniqueViolationName: null when it is not a unique violation', () => {
    assert.strictEqual(getUniqueViolationName(sqlError(547, "constraint 'FK_x'")), null);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run (in `backend/`): `node --test test/unit/shared/validate.test.js test/unit/shared/sqlErrors.test.js`
Expected: FAIL — `Cannot find module '../../../shared/validate'` and `'../../../shared/sqlErrors'`.

- [ ] **Step 4: Write `backend/shared/validate.js`**

```js
const { AppError } = require('./AppError');

const PARTS = ['params', 'query', 'body'];

// Parsed values go to req.valid: Express 5 makes req.query a read-only getter,
// and one place for all parsed input keeps controllers consistent.
function validate(schemas) {
    return (req, res, next) => {
        const valid = {};
        const details = [];
        for (const part of PARTS) {
            const schema = schemas[part];
            if (!schema) continue;
            const result = schema.safeParse(req[part]);
            if (result.success) {
                valid[part] = result.data;
            } else {
                for (const issue of result.error.issues) {
                    details.push({ in: part, path: issue.path.join('.'), message: issue.message });
                }
            }
        }
        if (details.length > 0) {
            return next(new AppError('VALIDATION_ERROR', 400, 'Request validation failed', details));
        }
        req.valid = valid;
        return next();
    };
}

module.exports = { validate };
```

- [ ] **Step 5: Write `backend/shared/sqlErrors.js`**

```js
// SQL Server: 2601 = duplicate key in a unique index, 2627 = unique/PK constraint.
const UNIQUE_VIOLATION_NUMBERS = new Set([2601, 2627]);
const VIOLATED_NAME = /(?:unique index|constraint) '([^']+)'/i;

const isUniqueViolation = (err) => UNIQUE_VIOLATION_NUMBERS.has(err?.number);

const getUniqueViolationName = (err) => {
    if (!isUniqueViolation(err)) return null;
    const match = VIOLATED_NAME.exec(err.message);
    return match ? match[1] : null;
};

module.exports = { isUniqueViolation, getUniqueViolationName };
```

- [ ] **Step 6: Run the tests**

Run (in `backend/`): `node --test test/unit/shared/validate.test.js test/unit/shared/sqlErrors.test.js`
Expected: 8 pass.
Run (in `backend/`): `npm test`
Expected: all pass.

- [ ] **Step 7: Hand off for review**

Light self-check. Show the diff. Suggested commit:
`feat(backend): add zod request validation and SQL unique-violation helpers`

---

### Task 4: `app.js` / `server.js` split + JSON 404 + `startApp` helper

**Why:** Tests need the Express app without `listen()` and without the real router (which loads the DB layer). The old polling in `server.js` queries tables that no longer exist and logs an error every 30 s; B4 adds the new job.

**Files:**
- Create: `backend/app.js`
- Modify: `backend/server.js` (whole file)
- Create: `backend/test/helpers/startApp.js`
- Test: `backend/test/unit/app.test.js`
- Modify: `docs/superpowers/specs/2026-10-01-backend-redesign-design.md` section 9 (add `ROUTE_NOT_FOUND`)

**Interfaces:**
- Consumes: `AppError` (Task 2), `createErrorHandler` (Task 2).
- Produces:
  - `createApp({ apiRouter, logger = console }) → express app`. Order: `cors()` → `express.json()` → `/api/assembly` → `apiRouter` → JSON 404 for unmatched `/api/assembly/*` → error handler. No `listen()`.
  - `startApp(app) → Promise<{ baseUrl: string, close: () => Promise<void> }>` test helper. Listens on `127.0.0.1`, random free port.
  - New error code `ROUTE_NOT_FOUND` (404).

- [ ] **Step 1: Write the test helper `backend/test/helpers/startApp.js`**

```js
const { once } = require('node:events');

// Starts an app on a random free local port for HTTP-level tests.
async function startApp(app) {
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address();
    return {
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => new Promise((resolve, reject) => {
            server.close((err) => (err ? reject(err) : resolve()));
        }),
    };
}

module.exports = { startApp };
```

- [ ] **Step 2: Write the failing test `backend/test/unit/app.test.js`**

The router is a fake, so no DB and no external API is touched. The only HTTP is to the in-process test server on `127.0.0.1`.

```js
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const express = require('express');
const { createApp } = require('../../app');
const { AppError } = require('../../shared/AppError');
const { startApp } = require('../helpers/startApp');

const logged = [];
const logger = { error: (...args) => logged.push(args) };

const router = express.Router();
router.get('/ok', (req, res) => res.json({ ok: true }));
router.post('/echo', (req, res) => res.json({ body: req.body }));
router.get('/app-error', () => { throw new AppError('LOT_NOT_FOUND', 404, 'Lot not found'); });
router.get('/async-crash', async () => { throw new Error('connection string with secret'); });

let server;
before(async () => { server = await startApp(createApp({ apiRouter: router, logger })); });
after(() => server.close());

const call = (path, init) => fetch(`${server.baseUrl}${path}`, init);
const postJson = (path, raw) => call(path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw,
});

test('the api router is mounted under /api/assembly', async () => {
    const res = await call('/api/assembly/ok');
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { ok: true });
});

test('JSON bodies are parsed', async () => {
    const res = await postJson('/api/assembly/echo', '{"lot_no":"L1"}');
    assert.deepStrictEqual(await res.json(), { body: { lot_no: 'L1' } });
});

test('AppError thrown in a route becomes its status and JSON body', async () => {
    const res = await call('/api/assembly/app-error');
    assert.strictEqual(res.status, 404);
    assert.deepStrictEqual(await res.json(), { error: 'LOT_NOT_FOUND', message: 'Lot not found' });
});

test('rejected promise in an async route becomes 500 INTERNAL with no internals', async () => {
    const res = await call('/api/assembly/async-crash');
    assert.strictEqual(res.status, 500);
    const text = await res.text();
    assert.deepStrictEqual(JSON.parse(text), { error: 'INTERNAL', message: 'Internal server error' });
    assert.doesNotMatch(text, /secret/);
    assert.ok(logged.length >= 1);
});

test('malformed JSON body becomes 400 VALIDATION_ERROR', async () => {
    const res = await postJson('/api/assembly/echo', '{"lot_no":');
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).error, 'VALIDATION_ERROR');
});

test('unknown /api/assembly route returns 404 ROUTE_NOT_FOUND as JSON', async () => {
    const res = await call('/api/assembly/register-tag', { method: 'POST' });
    assert.strictEqual(res.status, 404);
    assert.match(res.headers.get('content-type'), /application\/json/);
    const body = await res.json();
    assert.strictEqual(body.error, 'ROUTE_NOT_FOUND');
    assert.match(body.message, /POST \/api\/assembly\/register-tag/);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run (in `backend/`): `node --test test/unit/app.test.js`
Expected: FAIL — `Cannot find module '../../app'`.

- [ ] **Step 4: Write `backend/app.js`**

```js
const express = require('express');
const cors = require('cors');
const { AppError } = require('./shared/AppError');
const { createErrorHandler } = require('./shared/errorHandler');

function createApp({ apiRouter, logger = console }) {
    const app = express();
    app.use(cors());
    app.use(express.json());

    app.use('/api/assembly', apiRouter);
    app.use('/api/assembly', (req, res, next) => {
        next(new AppError('ROUTE_NOT_FOUND', 404, `No route for ${req.method} ${req.originalUrl}`));
    });

    app.use(createErrorHandler({ logger }));
    return app;
}

module.exports = { createApp };
```

- [ ] **Step 5: Rewrite `backend/server.js`**

Replace the whole file (this removes the old polling and the commented-out copy):

```js
// dotenv must load before any module that reads process.env at require time.
require('dotenv').config();
const { createApp } = require('./app');
const assemblyRoutes = require('./routes/assembly');

// Must scale to 60+ reader nodes later.
const app = createApp({ apiRouter: assemblyRoutes });

const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
```

- [ ] **Step 6: Run the tests**

Run (in `backend/`): `node --test test/unit/app.test.js`
Expected: 6 pass.
Run (in `backend/`): `npm test`
Expected: all pass.
Check that the old polling is gone:
Run (repo root): `git grep -n "poolPromise\|startPolling" -- backend ":!backend/node_modules"`
Expected: only the local `poolPromise` variable inside `backend/database.js`.

- [ ] **Step 7: Add `ROUTE_NOT_FOUND` to the spec**

In `docs/superpowers/specs/2026-10-01-backend-redesign-design.md`, section 9 table, add after the `LOCATION_NOT_FOUND` row:

```markdown
| `ROUTE_NOT_FOUND` | 404 | No route matches under `/api/assembly` (e.g. FE still calls an old route, R7) |
```

Mark roadmap item O3 `[x]`.

- [ ] **Step 8: Ask the user to smoke-test the server**

The server talks to the real DB, so I don't start it. Ask the user to run, in `backend/`:

```text
node server.js
```

(`backend/package.json` has no `start` script.)

Then, in a second terminal: `curl -i http://localhost:5001/api/assembly/no-such-route`
Expected: the log shows `Server running on port 5001` and no `[Polling]` lines after 30 s. curl shows `404` with `{"error":"ROUTE_NOT_FOUND",...}`.
Ask the user to send back: the server log (first 40 s) and the curl status line + body.

- [ ] **Step 9: Hand off for review**

Light self-check. Show the diff. Mark B0 `[x]` in the roadmap with file references. Suggested commit:
`refactor(backend): split app and server, drop old polling, JSON 404`

---

## End of B0

After Task 4:
- All B0 rows in the roadmap get `[x]` with what was done and where.
- Next: B1 plan (`2026-10-01-b1-master-data.md`), starting with B1.1 (SQL) in the main session, Opus 5.5 high. Decide O1 there.

### Deferred / blocked in B0

None so far.

### Discovered issues (not fixed in B0, flagged only)

- `backend/database.js` falls back to a real server name and DB name when `DB_SERVER` / `DB_NAME` are not set. The rule is "fail fast on missing required env vars". Suggest: remove the defaults and throw at startup in a later task.
- `backend/.env.example` contains a real internal hostname in `API_RECEIVE_URL`. Runbook / example rule: names only, no real hostnames. Suggest: replace with a placeholder.
- `backend/routes/assembly.js:16` builds `` `Bearer ${process.env.API_TOKEN}` `` while `.env.example` says the token already includes `Bearer `, so the header may be `Bearer Bearer ...`. The old route is replaced in B2; `as400Client` must use the token as-is (spec 8.1).
