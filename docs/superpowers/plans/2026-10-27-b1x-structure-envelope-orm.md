# B1x Structure, Envelope, ORM Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` to implement this plan task by task, **inline in the main session**. Never use subagents (user rule). Steps use checkbox (`- [ ]`) syntax. After each task: stop, show the diff, wait for the user's review. Never run `git add` / `git commit`; list the files and suggest a commit message instead. Never run SQL or integration tests against a database; the user runs them.

**Goal:** Before B2 starts, give the backend a linter, one predictable JSON response shape, a folder-per-resource module layout, and Sequelize v6 repositories, proven on the `master` module.

**Architecture:** Each resource gets its own folder with one file per layer (`processes/processes.service.js`), like NestJS. Success bodies are `{ data, meta? }` and error bodies are `{ error: { code, message, details?, request_id } }`. Repositories keep their signature `fn(db, ...args)`. Only `db` changes: from the `mssql` shape (`{ query }`) to an ORM context (`{ sequelize, tx }`). So services and their unit tests do not change. Integration tests are written against the current raw-SQL repositories first, and the Sequelize versions must pass the same tests.

**Tech Stack:** Node 22 (CommonJS), Express 5.2, zod 4, mssql 12 (legacy only, after this plan), Sequelize 6 + tedious, ESLint 9 flat config, `node:test`, Bruno YAML.

**Spec:** `docs/superpowers/specs/2026-10-01-backend-redesign-design.md` (sections 6, 7.4, 7.6, 7.8, 9). Roadmap: `docs/superpowers/plans/2026-10-01-backend-redesign-roadmap.md`. The decisions come from the review of `backend/modules/master` on 2026-10-27 (user answers 1–5).

## Global Constraints

- CommonJS stays. API base stays `/api/assembly`. Error codes stay as in spec section 9; only the body shape changes.
- `sequelize.sync()` is never called, in any file or test. The schema lives only in `.sql` migrations that the user runs.
- New files under `modules/` are kebab-case with a dot suffix: `<resource>.<layer>.js` (`status-locations.service.js` for two words). Existing `shared/*.js`, `app.js`, `db.js` and legacy files keep their names.
- Repository functions keep the shape `fn(db, ...args)` and return plain objects (never Sequelize instances).
- Only `index.js` files (and integration tests) may `require` a `*.repository.js` or `*.models.js` file. Another module uses your module only through the services your `index.js` exports.
- Timestamps are DB time (`SYSDATETIME()`); the app never writes `created_at`.
- Before writing ESLint or Sequelize code, fetch the docs with Context7 (`resolve-library-id` → `query-docs`).
- Every endpoint whose body changes gets its Bruno file updated in the same task. Fake data only.
- Integration tests run only on a database whose `DB_NAME` ends with `_dev`, and every write in them is rolled back.

## Decisions (not in the spec yet)

Each one is written into the spec in the task that uses it.

| # | Decision | Why | Spec edit in |
| --- | --- | --- | --- |
| S1 | Folder per resource: `modules/master/{processes,locations,statuses}/<resource>.{routes,controller,service,repository,schemas}.js`. Code shared inside the module: `modules/master/master.errors.js`, `master.schemas.js`, `master.models.js`. | You delete a feature by deleting one folder. The layout B2 will copy. | Task 4 (6) |
| S2 | Success: `{ "data": <row or array> }`. Paged list: `{ "data": [...], "meta": { "page", "page_size", "total" } }` (B5 only). `meta` appears only when it has content. `DELETE` → 204, no body. | One shape for the FE to unwrap. Adding paging later does not break the contract. | Task 3 (7.6, 7.8, 9) |
| S3 | Error: `{ "error": { "code", "message", "details"?, "request_id" } }`. | No `error_` prefix inside `error`. `request_id` links a user's screenshot to the server log. | Task 3 (9) |
| S4 | Request id: inbound `X-Request-Id` is kept if it matches `^[A-Za-z0-9._-]{1,64}$`, else replaced by `crypto.randomUUID()`. Set on `req.id`, sent back in the `X-Request-Id` response header, written in the 500 log line. | The format check keeps junk out of the logs (and blocks header injection). | Task 2 (9) |
| S5 | Not wrapped: mock upstream routes (7.9, they copy external APIs), the SSE stream (7.10), and legacy `routes/assembly.js` handlers until their branch rewrites them. Errors that go through `errorHandler` are wrapped everywhere, legacy paths included. | Mocks must keep the real shapes. The legacy FE screens still read the legacy bodies. | Task 3 (7.9, 9) |
| S6 | `db.js` adds `orm` (`{ sequelize, tx: undefined }`) and `ormTransaction(fn)` (fn gets `{ sequelize, tx }`). Repositories read models from `db.sequelize.models.<Name>` and pass `transaction: db.tx` on every call. Raw T-SQL uses `db.sequelize.query(sql, { replacements, transaction: db.tx })`. | It keeps DI and the `fn(db, ...)` seam, with no CLS (hidden global transaction state). | Task 6 (6) |
| S7 | One `master.models.js` → `defineMasterModels(sequelize)` defines `MasterProcess`, `MasterLocation`, `MasterStatus` and their associations. Options: `freezeTableName: true`, `timestamps: false`. | The associations cross resources. Three small models do not justify three files. | Task 6 |
| S8 | `DB_SERVER` may be `host\instance`. `buildOrmOptions(env)` splits it into `host` + `dialectOptions.options.instanceName` and then leaves `port` out (tedious does not accept both). | The `mssql` package parses `host\instance` itself. Sequelize does not. | Task 6 |
| S9 | ESLint 9 flat config: `@eslint/js` recommended, `globals.node`, and `@stylistic` rules that match the current style (4-space indent, single quotes, semicolons, `always-multiline` trailing commas, `space-infix-ops`). `routes/**` and `services/**` (legacy) are ignored. | It enforces the style without a Prettier rewrite of every file. Legacy code is deleted in B2–B6, so fixing it is wasted work. | Task 1 (README) |
| S10 | Layer rule via core `no-restricted-syntax` on `require(...)` calls: requiring `/\.(repository|models)$/` is an error outside `modules/**/index.js` and `test/integration/**`. | No extra plugin. It enforces S1's cross-module rule and the layer rule together. | Task 4 (README) |

## Order and why

This is the help with priority you asked for. The order is chosen by **what gets more expensive the longer we wait**.

| # | Task | Why at this position | If we skip or move it |
| --- | --- | --- | --- |
| 1 | ESLint | Cheapest. After it, every later diff is linted, and your PostToolUse `eslint --fix` hook starts working. | Style fixes leak into feature diffs and make reviews noisy. |
| 2 | Request id | Small. Task 3 puts `request_id` into the error body, so the id must exist first. | **Can be cut.** Then Task 3 leaves out `request_id`, and B2.1 (`httpLogger`) adds it later. |
| 3 | Response envelope | A contract change. Today it costs 11 endpoints and **zero** FE callers (the FE does not call the new routes yet, B1.7-fe). Every endpoint B2–B5 adds raises that cost. | Doing it after B2 means changing the code, tests and Bruno of every pairing endpoint as well. |
| 4 | Folder split | It only moves files, so the tests prove nothing changed. It comes before Sequelize so that tasks 6 and 7 are one resource per diff. | Mixing a file move with a rewrite gives one big diff that is hard to review. |
| 5 | Integration tests on current repos | The safety net for the ORM swap. Unit tests mock the repository, so today **nothing** checks the real SQL behavior automatically. | The Sequelize rewrite is checked only by hand in Bruno. A subtle change, such as a nested `process` object or `[0, []]` instead of `null`, ships unnoticed. |
| 6 | Sequelize setup + processes | Sets the pattern on the simplest table. | — |
| 7 | Locations + statuses on Sequelize | Copies the pattern, then removes the raw-SQL path from `master`. | — |

Tasks 1–4 have value even if you later drop Sequelize. Tasks 5–7 only matter if you keep it.

## Status

| # | Task | Status |
| --- | --- | --- |
| 1 | ESLint for the backend (was roadmap B1.6-lint) | [ ] |
| 2 | Request id middleware | [ ] |
| 3 | Response envelope | [ ] |
| 4 | Folder per resource + `assertAffected` + README rules | [ ] |
| 5 | Integration tests on the raw-SQL master repositories | [ ] |
| 6 | Sequelize setup + processes repository | [ ] |
| 7 | Locations + statuses repositories on Sequelize | [ ] |

## Model, effort, where

```
New session (Sonnet 5, medium):     task 1 — lint setup, unrelated to the rest; handoff: this plan + S9
Main session (Sonnet 5, high):      tasks 2, 3 — share errorHandler / app.js; task 3 is a contract change you review closely
Main session, /compact first:       task 4 — reuses the file names from S1; many file moves
Main session (Opus 5.5, high):      tasks 5, 6 — the integration tests and the ORM pattern are designed together
Main session, /compact first:       task 7 — copies the pattern from task 6
```

## Review Focus

1. **The locations list stays flat after Sequelize.** `process_code` and `process_name` stay top-level keys, not `process: {...}`. Pinned by the Task 5 locations test, which must pass unchanged in Task 7.
2. **Wrapped SQL errors still map.** A Sequelize `UniqueConstraintError` / `ForeignKeyConstraintError` must still give `MASTER_DUPLICATE` / `MASTER_INVALID_REF` / `MASTER_IN_USE`, with the right `details[0].path`. Pinned by the Task 5 tests (real DB error, asserted through `getUniqueViolationName` / `getConstraintConflict`) and the Task 6 `sqlErrors` unit tests.
3. **Not found means `null` / `0`, never a throw or an array.** Update with an unknown id → `null`, delete with an unknown id → `0`. Pinned by Task 5, which must pass unchanged in Tasks 6–7.
4. **Errors outside `master` use the new shape too.** Body-parser 400, `ROUTE_NOT_FOUND` on a legacy path, and an unknown 500 → `{ error: { code, ... } }`. Pinned by `app.test.js` in Task 3.
5. **A junk inbound `X-Request-Id`** (70 chars, or containing a space) is replaced, never echoed back. Pinned in Task 2.

---

### Task 1: ESLint for the backend

**Files:**
- Create: `backend/eslint.config.js`
- Modify: `backend/package.json` (devDependencies; scripts `lint`, `lint:fix`)
- Modify: any file under `modules/`, `shared/`, `scripts/`, `test/`, plus `app.js`, `server.js`, `db.js`, where `lint:fix` changes formatting or a rule reports an error
- Modify: `backend/README.md` (Run section: `npm run lint`)
- Modify: `docs/superpowers/plans/2026-10-01-backend-redesign-roadmap.md` (B1.6-lint row → points to this plan, Task 1)

**Interfaces:**
- Produces: `npm run lint` (`eslint .`), `npm run lint:fix` (`eslint . --fix`). Task 4 adds the S10 rule to this config.

- [ ] **Step 1:** Fetch the ESLint 9 flat config and `@stylistic/eslint-plugin` docs via Context7.
- [ ] **Step 2:** `npm install -D eslint @eslint/js globals @stylistic/eslint-plugin` in `backend/`.
- [ ] **Step 3:** Write `eslint.config.js` per S9 (same `defineConfig` / `globalIgnores` style as `frontend/eslint.config.js`). Ignore `node_modules`, `routes/**`, `services/**`, with a comment saying why (legacy, deleted in B2–B6).
- [ ] **Step 4:** Run `npm run lint`, then `npm run lint:fix`. Expected: only formatting changes, including `modules/master/service.js:39` (`fieldDetails =(` → `fieldDetails = (`). Fix any remaining error by hand. If a rule fights the existing style in more than a few places, stop and ask.
- [ ] **Step 5:** `npm run lint` → 0 errors. `npm test` → the same pass count as before Step 4.
- [ ] **Step 6:** Hand over: list the files and suggest `chore(backend): add eslint flat config`.

### Task 2: Request id middleware

**Files:**
- Create: `backend/shared/requestId.js`
- Modify: `backend/app.js` (mount first, before `cors`)
- Modify: `backend/shared/errorHandler.js` (500 log line includes `req.id`)
- Test: `backend/test/unit/shared/requestId.test.js`, `backend/test/unit/app.test.js`

**Interfaces:**
- Produces: `assignRequestId()` → Express middleware that sets `req.id: string` and the `X-Request-Id` response header. Task 3 reads `req.id`.

- [ ] **Step 1: Write the failing tests** in `app.test.js`:
  - `every response has an X-Request-Id header (uuid when none sent)`: `GET /api/assembly/ok` → header matches `/^[0-9a-f-]{36}$/`.
  - `a valid inbound X-Request-Id is echoed`: send `abc-123` → header `abc-123`.
  - `a junk inbound X-Request-Id is replaced`: send `'x'.repeat(70)` and `'a b'` → the header is a uuid, never the input.
  - `the 500 log line carries the request id`: send `X-Request-Id: t-1` to `/async-crash` → `logged[0]` contains `t-1`.
- [ ] **Step 2:** `npm test` → the 4 new tests FAIL.
- [ ] **Step 3:** Implement `assignRequestId()` in `shared/requestId.js` using the S4 regex and `crypto.randomUUID()`. Mount it in `app.js`. In `errorHandler.js`, change the log prefix to `[${req.method} ${req.originalUrl} ${req.id}]`.
- [ ] **Step 4:** `npm test` → all pass. `npm run lint` → 0 errors.
- [ ] **Step 5:** Spec section 9: add one line about S4. Hand over: suggest `feat(backend): add X-Request-Id to every response`.

### Task 3: Response envelope

**Files:**
- Create: `backend/shared/respond.js`
- Modify: `backend/shared/errorHandler.js`
- Modify: `backend/modules/master/controller.js`
- Test: `backend/test/unit/shared/respond.test.js`, `backend/test/unit/shared/errorHandler.test.js`, `backend/test/unit/app.test.js`, `backend/test/unit/modules/master/routes.test.js`
- Modify: the 11 `bruno/AYT-RFID/master/*.yml` files (doc examples), `bruno/AYT-RFID/master/folder.yml` (describe the envelope once)
- Modify: spec 6 (`errorHandler.js` line), 7.4 (scan response inside `data`), 7.6 (`meta` for `page` / `page_size`), 7.8 (table: `{ data: [...] }`, `{ data: row }`), 7.9 (mocks not wrapped), 9 (body shape, S2, S3, S5)
- Modify: roadmap row B1.7-fe: add "FE must read `res.data.data` and `error.code`"

**Interfaces:**
- Consumes: `req.id` (Task 2).
- Produces: `sendData(res, data, { status = 200, meta } = {})` → sends `{ data }`, or `{ data, meta }` when `meta` is given. All later controllers use it. Error body per S3.

- [ ] **Step 1: Write the failing tests.**
  - `respond.test.js`: `sendData(res, [1])` → status 200, body `{ data: [1] }` with no `meta` key. `sendData(res, row, { status: 201 })` → 201, `{ data: row }`. `sendData(res, [], { meta: { page: 1, page_size: 50, total: 0 } })` → body has both keys.
  - `errorHandler.test.js`: change every body assertion to the S3 shape, e.g. `{ error: { code: 'TAG_IN_USE', message: 'Tag is in use', details: { lot_no: 'L1' }, request_id: 'r-1' } }` with `req.id = 'r-1'`. With no details → no `details` key. Unknown error → `{ error: { code: 'INTERNAL', message: 'Internal server error', request_id } }`.
  - `app.test.js`: invalid JSON body → `error.code === 'VALIDATION_ERROR'`. Unknown path → `error.code === 'ROUTE_NOT_FOUND'`. Both have `error.request_id`.
  - `routes.test.js`: every success assertion reads `body.data`. Every error assertion reads `body.error.code`. `DELETE` → 204 with an empty body.
- [ ] **Step 2:** `npm test` → the changed tests FAIL.
- [ ] **Step 3:** Implement `sendData` in `shared/respond.js`. Change `errorHandler.js` to build the S3 body (all three branches). Change the master controller to call `sendData` (201 for create).
- [ ] **Step 4:** `npm test` → all pass. `npm run lint` → 0 errors.
- [ ] **Step 5:** Bruno and spec, using the `bruno-docs` skill. Update every 2xx and error example in the 11 master files. Add the envelope to `folder.yml` docs. Make the spec edits listed under Files.
- [ ] **Step 6:** Hand over. You run the 11 master Bruno requests on `npm run dev`. Suggest `feat(backend)!: wrap responses in data / error envelope`.

### Task 4: Folder per resource + `assertAffected` + README rules

This is a refactor only: no behavior change (`refactoring-safely` skill). Test bodies move with their code. Only `require` paths and factory names change.

**Files:**
- Create: `backend/modules/master/master.errors.js`, `backend/modules/master/master.schemas.js`
- Create: `backend/modules/master/{processes,locations,statuses}/<resource>.{routes,controller,service,repository,schemas}.js` (locations has no delete)
- Modify: `backend/modules/master/index.js`
- Delete: `backend/modules/master/{controller,routes,service,repository,schemas}.js`
- Test: move `test/unit/modules/master/{routes,service,schemas}.test.js` into `test/unit/modules/master/<resource>/<resource>.{routes,service,schemas}.test.js`. Create `test/unit/modules/master/master.errors.test.js`.
- Modify: `backend/eslint.config.js` (S10), `backend/README.md` (Module layout, Naming, Rules), spec 6 (tree), roadmap (B2 file paths follow S1)

**Interfaces:**
- Produces (`master.errors.js`): `withMasterErrors(rules, fn)` (was `run`), `toMasterError(err, rules)`, `orNotFound(row, entity, id)`, `assertAffected(count, entity, id)` (throws `MASTER_NOT_FOUND` 404 when `count === 0`).
- Produces (`master.schemas.js`): `idParams`.
- Produces: `createProcessesService({ repo, db })`, `createProcessesController({ service })`, `createProcessesRoutes({ controller })`, and the same for `Locations` and `Statuses`. Service and repository method names do not change (`listProcesses`, `selectProcesses`, ...). `statuses.service.js` exports `SYSTEM_STATUS_CODES`.
- Produces: `createMasterModule({ db })` still returns one router (`server.js` does not change).

- [ ] **Step 1:** `npm test` and write down the pass count (N).
- [ ] **Step 2: Write the failing test** `master.errors.test.js`: `assertAffected(0, 'Process', 9)` throws `AppError` with code `MASTER_NOT_FOUND`, status 404, message `Process 9 not found`. `assertAffected(1, ...)` returns without throwing.
- [ ] **Step 3:** Create `master.errors.js` and `master.schemas.js`. Split the service, repository, schemas, controller and routes into the three folders. Replace `orNotFound(affected !== 0, ...)` with `assertAffected(affected, ...)`. Rewire `index.js` to mount the three routers. Delete the old files.
- [ ] **Step 4:** Move and split the three test files. Change only `require` paths and factory names.
- [ ] **Step 5:** `npm test` → N + 2 pass (the 2 new `assertAffected` tests).
- [ ] **Step 6:** Add the S10 rule to `eslint.config.js`. Prove it works: temporarily add `require('./processes.repository')` to `processes.controller.js` → `npm run lint` reports it. Remove the line. `npm run lint` → 0 errors.
- [ ] **Step 7:** README: new Module layout table (S1 names), Naming rule (Global Constraints), Rules:
  - A module's `index.js` is its only public file.
  - Another module receives services by injection. B2 changes `createMasterModule` to return `{ router, services }` when pairing needs statuses and locations.
  - `toMasterError` moves to `shared/sqlErrors.js` when a second module needs it.

  Make the spec 6 and roadmap edits.
- [ ] **Step 8:** Hand over. Suggest `refactor(master): split into one folder per resource`.

### Task 5: Integration tests on the raw-SQL master repositories

These are characterization tests: they record what the current repositories do, so the Sequelize versions can be checked against them.

**Files:**
- Create: `backend/test/helpers/withRollback.js`
- Create: `backend/test/integration/modules/master/{processes,locations,statuses}/<resource>.repository.test.js`
- Modify: `backend/package.json`: `test:integration` → `node --env-file=.env --test "test/integration/**/*.test.js"`
- Create: `docs/runbooks/integration-tests.md` (`runbook-docs` skill)

**Interfaces:**
- Produces: `withRollback(transaction, fn)` → runs `fn(txDb)` inside `transaction(...)`, always rolls back, and returns what `fn` returned. It throws before connecting if `process.env.DB_NAME` does not end with `_dev`. Tasks 6–7 call it with `ormTransaction` instead of `db.transaction`.

- [ ] **Step 1:** Write `withRollback`. To roll back, `fn` runs, then the helper throws a private sentinel inside the transaction callback, catches that sentinel outside, and returns the saved result. Any other error is rethrown.
- [ ] **Step 2:** Write the tests. Each test creates its own fixture rows inside its rolled-back transaction and never relies on seed ids. All of them call the repository functions as `repo.fn(txDb, ...)`. Assertions:
  - processes: `selectProcesses` rows have exactly the keys `id, process_code, process_name, can_clear_tag`, are ordered by `process_code`, and `can_clear_tag` is boolean. `insertProcess` returns those keys. `updateProcess(txDb, 999999, body)` → `null`. `deleteProcess(txDb, 999999)` → `0`. Insert of a duplicate code rejects with an error where `getUniqueViolationName(err) === 'UQ_master_process_code'`. Delete of a process used by a location rejects where `getConstraintConflict(err).kind === 'REFERENCE'`.
  - locations: `selectLocations` rows have the flat keys `id, location_code, location_name, process_id, is_active, created_at, process_code, process_name`, and `created_at instanceof Date`. Insert with `process_id: 999999` rejects with conflict `{ kind: 'FOREIGN KEY', name: 'FK_master_location_process' }`. `updateLocation(txDb, 999999, body)` → `null`.
  - statuses: `selectStatusById(txDb, 999999)` → `null`. A second status on the same location rejects with unique name `UX_master_assy_status_location`. `status_code: 'CLEARED'` with a `location_id` rejects with conflict kind `CHECK`. `deleteStatus(txDb, 999999)` → `0`.
- [ ] **Step 3:** Write the runbook. It covers: point `DB_NAME` at `db_rfid_assembly_dev`, `cd backend`, `npm run test:integration`, send back the pass/fail summary only.
- [ ] **Step 4:** `npm test` still passes (the unit glob does not pick up integration tests). `npm run lint` → 0 errors.
- [ ] **Step 5:** Hand over. **You run** `npm run test:integration` in `backend/`. All tests must pass on the raw-SQL repositories before Task 6. Suggest `test(master): add repository integration tests`.

### Task 6: Sequelize setup + processes repository

**Files:**
- Modify: `backend/package.json` (`sequelize@6`, plus `tedious` if Sequelize needs it listed directly)
- Modify: `backend/db.js` (add `buildOrmOptions`, `orm`, `ormTransaction`)
- Modify: `backend/shared/sqlErrors.js` (read the driver error from `err.parent` when present)
- Create: `backend/modules/master/master.models.js`
- Modify: `backend/modules/master/processes/processes.repository.js`, `backend/modules/master/index.js`, `backend/server.js`
- Test: `backend/test/unit/db.test.js`, `backend/test/unit/shared/sqlErrors.test.js`, `backend/test/integration/modules/master/processes/processes.repository.test.js` (switch to `ormTransaction` only)
- Modify: `backend/README.md` (Rules: new repositories use `orm`, raw T-SQL through `sequelize.query` with `replacements`), spec 6 (`db.js` line, stack)

**Interfaces:**
- Consumes: `withRollback` (Task 5).
- Produces: `buildOrmOptions(env) → Sequelize options`, `orm: { sequelize, tx: undefined }`, `ormTransaction(fn: ({ sequelize, tx }) => Promise<T>) → Promise<T>`, `defineMasterModels(sequelize)`.
- Produces: `createMasterModule({ db, orm })`. Processes uses `orm`; locations and statuses still use `db` until Task 7.

- [ ] **Step 1:** Context7 checks:
  - The Sequelize 6 mssql dialect: which `tedious` versions it supports, how `create`/`update` behave with `returning` on mssql, how errors wrap the driver error (`parent` / `original`), and the instance name option.
  - Compare the supported `tedious` versions with what `mssql@12` installs. If they conflict, stop and ask.
- [ ] **Step 2: Write the failing unit tests.**
  - `db.test.js`: `buildOrmOptions({ DB_SERVER: 'PBSY70\\SQLEXPRESS', DB_PORT: '1433', ... })` → `host === 'PBSY70'`, `dialectOptions.options.instanceName === 'SQLEXPRESS'`, no `port`. `buildOrmOptions({ DB_SERVER: 'db1', DB_PORT: '1444' })` → `host === 'db1'`, `port === 1444`, no `instanceName`. Both give `dialect === 'mssql'`, `logging === false`, `define` with `freezeTableName: true, timestamps: false`, and `encrypt: true, trustServerCertificate: true` (same as `dbConfig`).
  - `sqlErrors.test.js`: an error `{ name: 'SequelizeUniqueConstraintError', parent: <2627 error> }` → `getUniqueViolationName` gives the constraint name. A wrapped 547 → `getConstraintConflict` gives `{ kind, name }`.
- [ ] **Step 3:** `npm test` → the new tests FAIL.
- [ ] **Step 4:** Implement `buildOrmOptions`, `orm`, `ormTransaction` in `db.js`. Creating the Sequelize instance must not connect (keep the lazy rule at `db.js:15`). Change `sqlErrors.js` to read from `err?.parent ?? err`. Write `defineMasterModels` per S7. Rewrite `processes.repository.js` on `db.sequelize.models.MasterProcess` (S6), returning plain objects. Wire `index.js` and `server.js` (`createMasterModule({ db, orm })`).
- [ ] **Step 5:** `npm test` → all pass, and the processes service tests are unchanged. `npm run lint` → 0 errors.
- [ ] **Step 6:** Switch the processes integration test to `withRollback(ormTransaction, ...)` and call `defineMasterModels(orm.sequelize)` in `before()`. Do not change any assertion.
- [ ] **Step 7:** Hand over. **You run** `npm run test:integration` (processes must pass unchanged) and the 4 Processes Bruno requests. Suggest `feat(master): move processes repository to sequelize`.

### Task 7: Locations + statuses repositories on Sequelize

**Files:**
- Modify: `backend/modules/master/{locations,statuses}/<resource>.repository.js`, `backend/modules/master/index.js` (`createMasterModule({ orm })` only), `backend/server.js`
- Modify: `backend/test/integration/modules/master/{locations,statuses}/<resource>.repository.test.js` (switch to `ormTransaction` only)
- Modify: `backend/db.js`, `backend/test/unit/db.test.js` (only if Step 4 finds no callers)

**Interfaces:**
- Consumes: `orm`, `ormTransaction`, `defineMasterModels` (Task 6).

- [ ] **Step 1:** Rewrite `locations.repository.js`. The list joins `MasterProcess` and returns flat `process_code` / `process_name` (Review Focus 1). Rewrite `statuses.repository.js`. Wire `index.js` and `server.js` with `orm` only.
- [ ] **Step 2:** `npm test` → all pass, service tests unchanged. `npm run lint` → 0 errors.
- [ ] **Step 3:** Switch the two integration tests to `ormTransaction`. Do not change any assertion.
- [ ] **Step 4:** Grep for callers of `query`, `transaction`, `typed`, `inferSqlType` exported by `db.js`, outside `db.js` and its own test. If none exist, delete them and their tests (`getPool` stays for legacy, B1.5-f). If some exist, keep them and list the callers in the hand-over.
- [ ] **Step 5:** Hand over. **You run** `npm run test:integration` (all master tests pass unchanged) and the 11 master Bruno requests. Suggest `feat(master): move locations and statuses repositories to sequelize`.

---

## Deferred (agreed, not in this plan)

- [-] DEFERRED — Move `toMasterError` to `shared/sqlErrors.js`. Why: only `master` uses it today. Resume: when B2 needs constraint mapping (rule written in README, Task 4).
- [-] DEFERRED — Paging (`meta`) on list endpoints. Why: master tables are small. Resume: B5 query module (shape fixed in Task 3, S2).
- [-] DEFERRED — `createMasterModule` returns `{ router, services }`. Why: no second module needs master services yet. Resume: B2.3, when pairing needs statuses and locations.
- [-] DEFERRED — FE reads the envelope. Why: the FE does not call the new routes yet. Resume: B1.7-fe / B7.
- [-] DEFERRED — Write `request_id` to `tb_assy_api_log`. Why: `httpLogger` does not exist yet. Resume: B2.1 (it may need a new column, with up/down SQL shown first).
