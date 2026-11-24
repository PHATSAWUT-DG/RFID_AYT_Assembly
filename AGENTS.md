# Agent guide

Rules for AI coding agents (Claude Code, Copilot, Cursor, Codex) and for humans. `CLAUDE.md` imports this file.

## Read first

1. `docs/HANDOFF.md`: current state, next task, known issues.
2. `docs/superpowers/plans/2026-10-01-backend-redesign-roadmap.md`: task list and status per branch.
3. `docs/superpowers/specs/2026-10-01-backend-redesign-design.md`: data model, decisions D1–D22, API, error codes. When the code and the spec disagree, stop and ask.
4. `backend/README.md` before any backend change. `modules/master/` is the reference module.

`docs/archive/` is history only. Never treat it as open work.

## Safety rules (never break these)

- **Never run SQL** against any database: no `sqlcmd`, no `Invoke-Sqlcmd`, no scripts in `backend/sql/` or `backend/scripts/`. Write the up and down SQL, show it, and a person runs it.
- **Never run** `npm run test:integration`, `npm start` or `npm run dev` in `backend/`. They connect to a real DB. Give the person the command, the folder, and what output to send back.
- **Never read or write `.env` files.** Use `.env.example` for variable names. Never put real secrets, hosts or employee data in code, tests, Bruno files or docs.
- **Never edit** legacy code to add features: `backend/routes/`, `backend/services/`, `getPool` in `backend/db.js`, and the old `Stored_*.sql` / `alter_*.sql` files. A roadmap task may only delete the handlers it replaces.
- No `git commit`, `push` or `rebase` unless the person asks.

## Way of working

- One task at a time: plan, get approval, build, the person reviews the diff, then the next task. Keep a task to about 5 files or 300 lines.
- Update the roadmap status line when a task is done.
- Critical code (concurrency, locks, retries, state changes, clears, deletes, migrations): explain each line and mark the risky ones.
- A new business rule that the spec does not cover: ask, do not guess (see HANDOFF K7).

## Done checklist

| Change | Also required |
| --- | --- |
| Any backend code | `npm run lint` and `npm test` pass in `backend/` |
| Any frontend code | `npm run lint`, `npm run typecheck`, `npx vitest run` and `npm run build` pass in `frontend/` |
| Endpoint added, changed or removed | Bruno request in `bruno/AYT-RFID/` updated in the same change, with fake example data |
| Frontend screen | Works in `npm run dev:mock`, with a mock handler for every call it makes |
| Flow a person runs by hand (migration, seed, job, load test) | Runbook in `docs/runbooks/<flow>.md` |
| New env var | Name added to the matching `.env.example` |

## Backend rules (short)

Full rules: `backend/README.md`.

- Layers: route → controller → service → repository → `db.js`. Each file imports only the next one down.
- Repositories: raw parameterized SQL on `mssql`. No ORM (Sequelize was tried and dropped).
- Errors: `AppError(code, httpStatus, message, details)`. Codes are in spec section 9. No `try/catch` in handlers.
- Input: zod through `validate(...)`. Downstream code trusts `req.valid`.
- Responses: `{ data, meta? }` on success, `{ error: { code, message, details?, request_id } }` on error.
- Unit tests use `test/helpers/fakeDb.js` and never touch a real DB or API.

## Frontend rules (short)

- React 19, Vite 8, TypeScript `strict`, Tailwind. Tests: Vitest.
- All HTTP goes through the one axios instance. API types live in `frontend/src/types/api.ts`.
- Mock mode (`npm run dev:mock`): the code is in `frontend/src/mocks/`. A production build must contain no mock code, and `npm run build` checks this. Never import mocks from a page.
- Every new API call gets a mock handler, and its method and path go into `CALLED_BY_APP` in `frontend/src/mocks/handlers/index.test.ts`.
- **The frontend still uses the old API** (HANDOFF K1): old routes like `/process` and `/status`, no envelope. Do not mix old and new calls in one screen. The switch happens in roadmap B7.
- UI text is partly Thai. Keep the existing language of a screen.

## Commands

| Folder | Command | Safe for an agent? |
| --- | --- | --- |
| `backend/` | `npm test`, `npm run lint`, `npm run lint:fix` | Yes |
| `backend/` | `npm run test:integration`, `npm start`, `npm run dev` | **No**: real DB |
| `frontend/` | `npx vitest run`, `npm run lint`, `npm run typecheck`, `npm run build` | Yes |
| `frontend/` | `npm run dev:mock` | Yes (fake data only) |
| `frontend/` | `npm start` | Only if the person says the backend may be called |
