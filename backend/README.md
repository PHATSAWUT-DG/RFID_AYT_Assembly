# Backend

Node 22 (CommonJS), Express 5, mssql, zod. Tests use `node:test`.

## Run

- `npm install`
- `npm test` runs the unit tests (everything is mocked; no DB, no network).
- `npm run lint` checks style and errors (ESLint 9 flat config). `npm run lint:fix` fixes formatting. `routes/` and `services/` (legacy) are ignored.
- `npm start` / `npm run dev` start the server (`server.js`). This one uses the real DB.
- Dev database: `docs/runbooks/dev-database-setup.md`.
- Env names (see `.env.example`): `PORT`, `DB_SERVER`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `API_TOKEN`, `API_RECEIVE_URL`, `API_PROD_RESULT_URL`.

## Folder map

| Path | Duty |
| --- | --- |
| `app.js` | `createApp({ apiRouter, logger })`: middleware, JSON 404, error handler. Never listens. |
| `server.js` | Loads env, wires the modules and the legacy router, listens. |
| `db.js` | The only DB access: `query`, `transaction`, `typed`, lazy pool. |
| `modules/<name>/` | New code, one folder per feature. `master/` is the reference. |
| `shared/` | `AppError`, `errorHandler`, `validate` (zod), `sqlErrors`. |
| `routes/`, `services/` | Legacy. See below. |
| `scripts/` | Scripts you run yourself (`rehash_passwords.js`, `setup_dev_database.sql`). |
| `sql/` | SQL: `create_assy_core.sql` (+ `.down.sql`) and older stored procedures. |
| `test/unit/` | Unit tests. The path mirrors the source path. |
| `test/helpers/` | `startApp` (HTTP test server), `fakeDb` (fake `db`). |

## Module layout

`modules/<name>/` has these files. Each one may import only the next one down.

| File | Duty |
| --- | --- |
| `routes.js` | `createXxxRoutes({ controller })`: paths, `validate(...)`, no logic. |
| `controller.js` | `createXxxController({ service })`: reads `req.valid`, sets the HTTP status. No `try/catch`. |
| `service.js` | `createXxxService({ repo, db })`: business rules, maps SQL errors to `AppError`. |
| `repository.js` | Plain functions `fn(db, ...args)`: parameterized SQL only. |
| `schemas.js` | zod schemas for params, query and body. |
| `index.js` | `createXxxModule({ db })`: wires the five files and returns the router. |

Flow: route -> controller -> service -> repository -> `db.js`.

## Naming

- Files are camelCase. PascalCase only for a file that exports a class (`AppError.js`).
- Factories are `createXxx({ deps })`. Dependencies are injected, so tests pass fakes.
- A test is `<file>.test.js` under `test/unit/`, at the same path as the source.

## Rules

- New code imports only `db.js` (`query`, `transaction`, `typed`). Never `getPool`.
- Input is checked by zod through `validate({ params, query, body })`. Code downstream trusts `req.valid`.
- Errors are `AppError(code, httpStatus, message, details)`. Codes are in spec section 9.
- Handlers do not catch errors to send a 500. Express 5 passes async errors to `errorHandler`.
- Every endpoint has a Bruno request in the same change.
- Unit tests never touch a real DB or API.

## Legacy

`routes/assembly.js`, `services/*.js` and the `getPool` export are old code. Do not copy them. Later branches rewrite them (see the roadmap).

## Links

- Spec: `docs/superpowers/specs/2026-10-01-backend-redesign-design.md`
- Roadmap: `docs/superpowers/plans/2026-10-01-backend-redesign-roadmap.md`
- Bruno collection: `bruno/AYT-RFID/`
