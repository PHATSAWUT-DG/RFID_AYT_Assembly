# Backend

Node 22 (CommonJS), Express 5, mssql, zod. Tests use `node:test`.

## Run

- `npm install`
- `npm test` runs the unit tests (everything is mocked; no DB, no network).
- `npm run test:integration` runs the repository tests on the real dev DB (`DB_NAME` must end with `_dev`; every write is rolled back). Runbook: `docs/runbooks/integration-tests.md`.
- `npm run lint` checks style and errors (ESLint 9 flat config). `npm run lint:fix` fixes formatting. `routes/` and `services/` (legacy) are ignored.
- `npm start` / `npm run dev` start the server (`server.js`). This one uses the real DB.
- Dev database: `docs/runbooks/dev-database-setup.md`.
- Env names (see `.env.example`): `PORT`, `LOG_DIR`, `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `API_TOKEN`, `API_RECEIVE_URL`, `API_PROD_RESULT_URL`.

## Folder map

| Path | Duty |
| --- | --- |
| `app.js` | `createApp({ apiRouter, logger })`: middleware, JSON 404, error handler. Never listens. |
| `server.js` | Loads env, wires the modules and the legacy router, listens. |
| `db.js` | The only DB access: `query`, `transaction`, `typed`, lazy pool. |
| `modules/<name>/` | New code, one folder per feature. `master/` is the reference. |
| `utils/` | Code used by 2+ modules, with no business logic: `AppError`, `errorHandler`, `requestId`, `accessLog`, `validate` (zod), `respond` (`sendData`), `sqlErrors`, `logger` (winston: console + daily file in `LOG_DIR`, kept 14 days). `utils/` never requires a file under `modules/`. |
| `logs/` | Log files when `LOG_DIR` is not set. Not in git. |
| `routes/`, `services/` | Legacy. See below. |
| `scripts/` | Scripts you run yourself (`rehash_passwords.js`, `setup_dev_database.sql`). |
| `sql/` | SQL: `create_assy_core.sql` (+ `.down.sql`) and older stored procedures. |
| `test/unit/` | Unit tests. The path mirrors the source path. |
| `test/integration/` | Repository tests on the real dev DB. Same path rule as `test/unit/`. |
| `test/helpers/` | `startApp` (HTTP test server), `fakeDb` (fake `db`), `withRollback` (runs an integration test in a transaction that is always rolled back). |

## Module layout

`modules/<name>/` has one folder per resource, plus `index.js` and optional shared files. `master/` is the reference.

```text
modules/master/
  index.js              createMasterModule({ db }) -> router
  master.errors.js      shared by the resources of this module
  master.schemas.js
  processes/            processes.{routes,controller,service,repository,schemas}.js
  locations/
  statuses/
```

Each resource folder has these files. Each one may import only the next one down.

| File | Duty |
| --- | --- |
| `<resource>.routes.js` | `createXxxRoutes({ controller })`: paths, `validate(...)`, no logic. |
| `<resource>.controller.js` | `createXxxController({ service })`: reads `req.valid`, sets the HTTP status. No `try/catch`. |
| `<resource>.service.js` | `createXxxService({ repo, db })`: business rules. Returns `mapMasterErrors(RULES, { ...functions })`, which maps SQL constraint errors to `AppError`. |
| `<resource>.repository.js` | Plain functions `fn(db, ...args)`: parameterized SQL only. |
| `<resource>.schemas.js` | zod schemas for params, query and body. |

`index.js` wires the files of every resource and returns the router.

Flow: route -> controller -> service -> repository -> `db.js`.

## Naming

- Files are camelCase. PascalCase only for a file that exports a class (`AppError.js`).
- Files under `modules/` are `<resource>.<layer>.js`. Shared module files are `<module>.<topic>.js` (`master.errors.js`).
- Factories are `createXxx({ deps })`. Dependencies are injected, so tests pass fakes.
- A test is `<file>.test.js` under `test/unit/`, at the same path as the source.

## Rules

- A module's `index.js` is its only public file. Only `index.js` (and integration tests) may `require` a `*.repository` file. ESLint enforces this (`no-restricted-syntax` in `eslint.config.js`).
- Another module gets what it needs through injected services, never through a deep `require`. B2 changes `createMasterModule` to return `{ router, services }` when pairing needs statuses and locations.
- `toMasterError` (`master.errors.js`) moves to `utils/sqlErrors.js` when a second module needs it.
- A repository returns plain objects. An update or a read by id returns the row or `null`; a delete returns the affected row count. The service passes either to `orNotFound`, which throws `MASTER_NOT_FOUND` 404 on `null` or `0`.

- New code imports only `db.js` (`query`, `transaction`, `typed`). Never `getPool`.
- Input is checked by zod through `validate({ params, query, body })`. Code downstream trusts `req.valid`.
- Errors are `AppError(code, httpStatus, message, details)`. Codes are in spec section 9.
- Handlers do not catch errors to send a 500. Express 5 passes async errors to `errorHandler`.
- Every endpoint has a Bruno request in the same change.
- Unit tests never touch a real DB or API.

## Cross-resource rules

Wiring: only `index.js` connects the layers, and only `server.js` connects the modules. Each factory gets what it uses.

```js
// modules/master/index.js
const service    = createProcessesService({ repo: processesRepo, db });
const controller = createProcessesController({ service });
const router     = createProcessesRoutes({ controller });
```

- **Data from 2+ tables → one SQL `JOIN` in one repository.** Never two repository calls merged in JS (more queries, and the two reads can see different data). The repository of the main entity in the result owns the query (`selectStatuses` joins location and process).
- **A repository may read (`JOIN`) any table. It writes only its own module's tables.** Another module's rows change only through that module's service.
- **One service, 2+ repositories → one named dependency per repository, one shared `txDb`.** The service opens `db.transaction(async (txDb) => ...)` and passes the same `txDb` to every repository, so all writes commit or roll back together.

  ```js
  const createPairingService = ({ db, lotsRepo, tagsRepo, pairingsRepo, statusesService, as400Client }) => ...
  ```

- **A service needs another module → inject its service, never require its repository.** `server.js` wires modules in dependency order: `const master = createMasterModule({ db })`, then `createPairingModule({ db, statusesService: master.services.statuses })`.
- **Another module's service runs outside your transaction** (it uses `db`, not your `txDb`). So:
  - read master data (a status id by code) **before** you open the transaction, then use the ids inside;
  - a read that must be inside the transaction (for example with a lock) is a `JOIN` in your own repository;
  - never pass `txDb` into another module's service.
- **Writes to one table come from one module only.** If two modules must write the same rows in one transaction, the boundary is wrong: move the write into one module (spec section 6, "One writer for state").
- **No cycles.** If A needs B and B needs A, move the shared part into its own service or merge the modules. The wiring order in `server.js` shows the graph.
- **Let the constraint check it.** Do not load another table to check a reference before a write when a foreign key or unique index already enforces it: a check-then-write races. Map the SQL error instead (`mapMasterErrors` / `withMasterErrors`).

## Legacy

`routes/assembly.js`, `services/*.js` and the `getPool` export are old code. Do not copy them. Later branches rewrite them (see the roadmap).

## Links

- Spec: `docs/superpowers/specs/2026-10-01-backend-redesign-design.md`
- Roadmap: `docs/superpowers/plans/2026-10-01-backend-redesign-roadmap.md`
- Bruno collection: `bruno/AYT-RFID/`
