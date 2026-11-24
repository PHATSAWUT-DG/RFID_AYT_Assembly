# Handoff

- Date: 2026-11-24
- From: TODO (name / role)
- To: TODO (name / role)
- Branch: `main` (the old `ayt-rfid` branch is no longer used)

## State in short

The system is **not launched** and has no production data. The backend is being rebuilt from zero (spec: no stored procedures, all rules in Node services). The foundation and the master data module are done. The core flows (pair, scan, clear, dashboard) are **not built yet** in the new design. The frontend is complete in **mock mode** but still calls the old API.

## Done

| Area | What | Where |
| --- | --- | --- |
| Backend B0 | Lazy DB pool, `AppError` + central error handler, zod validation, SQL error helpers, `app.js` / `server.js` split | `backend/app.js`, `backend/utils/` |
| Backend B1 | New schema (12 tables + seed). CRUD for processes, locations, statuses | `backend/sql/create_assy_core.sql`, `backend/modules/master/` |
| Backend B1x | ESLint, one response shape (`{ data }` / `{ error: { code, ... } }`), one folder per resource, integration tests, winston + morgan logging | `backend/eslint.config.js`, `backend/modules/master/*/` |
| Frontend | CRA → Vite, JS → strict TypeScript, mock mode, dashboard UI review, Clear Tag process selection | `frontend/` |
| Docs | Backend conventions, DB error guide, 3 runbooks, Bruno collection | see root `README.md` |

Decision to know: **Sequelize was tried and dropped (2026-10-30).** Repositories stay raw SQL on `mssql`. Reason: Sequelize 6 cannot read the schema from the DB, so every `ALTER TABLE` would need a second edit in a model file. Full note: `docs/archive/backend/2026-10-27-b1x-structure-envelope-orm.md`.

## Pending verification

- [ ] Run the Bruno requests for processes, locations and statuses against the dev backend (`bruno/AYT-RFID/`). The code and unit tests pass (107/107), but no one has run them against a real DB yet.

## Next, in order

Full task list with files and notes: [backend roadmap](superpowers/plans/2026-10-01-backend-redesign-roadmap.md). Write a step-by-step plan for each branch when it starts.

1. **B2 Register / pair.** HTTP logger, AS400 client, pairing repository (locks), `POST /pairings`, lot lookup, tag patch. B2.3–B2.4 handle concurrency (two operators pairing the same lot or tag): review them with care.
2. **B3 Scan.** `POST /scans` with "last scan wins" and the abnormal flag, SSE live events, a mock reader script for dev.
3. **B4 Clear.** Done API client, manual clear, auto-clear job.
4. **B5 Query / dashboard.** Lot and tag queries, journey, events, dashboard endpoints, machine client with cache.
5. **B6** (users / login / API log into the new layers) and **B7** (frontend moves to the new API, abnormal-scan toast). Both deferred, each needs a short spec first.

Open item: O2. When B5 is done, update spec section 2. `routes/assembly.js` will not be empty, because the reader routes and login stay until the reader phase and B6.

## Known issues and tech debt

| # | Issue | Impact | Fix with |
| --- | --- | --- | --- |
| K1 | The frontend calls the removed `/process` and `/status` routes: `ClearTag.tsx:84-85`, `Management/ProcessTab.tsx`, `Management/StatusTab.tsx`, `ReaderConfig.tsx:35` (all in `frontend/src/pages/Assembly/`), and the mocks in `frontend/src/mocks/handlers/admin.ts`. The new routes are `/processes`, `/locations`, `/statuses` (see Bruno). The frontend also does not read the new envelope (`res.data.data`, `error.code`) | Clear Tag, Management and Reader Config fail against the real backend. Fine in mock mode | B7, or earlier if admins need the screens |
| K2 | Legacy code: `backend/routes/assembly.js`, `backend/services/*.js`, the `getPool` export in `backend/db.js`, and the old `Stored_*.sql` / `alter_*.sql` files in `backend/sql/`. Old tables and SPs are already dropped from the dev DB, so most legacy routes fail | Do not copy or edit them. Each branch deletes the handlers it replaces | B2–B6 |
| K3 | The Python reader (`service/main_assy.py`) calls `/gauging-room-f1` and `/mc-gauging-f1`. B3.2 deletes them, and after that no real scan moves a lot. This was accepted on purpose (roadmap O4) | Use the mock reader (B3.4) in dev | Reader service phase (out of current scope) |
| K4 | Reader config path: `routes/assembly.js` reads `../service/reader_config.json` relative to the working folder, so `GET/PUT /readers-config` and `GET /dashboard/locations` only work when the server starts from `backend/`. `PUT /readers-config` also writes the body with no validation, so a bad write breaks the Python service on its next restart | Wrong start folder = broken Reader Config page | Small task of its own (old plan Task 19, `docs/archive/backend/2026-09-03-backend-service-layer-refactor.md`) |
| K5 | `GET /dashboard/daily-inventory` has a Bruno request and a frontend caller (`Dashboard.tsx`), but no backend route | Works only in mock mode | B5.4 |
| K6 | `API_PROD_RESULT_URL` (AS400 result / done API) is not provided by IT yet | Auto clear (B4) cannot run against the real system | Ask IT |
| K7 | Status form cannot set `process_id` (P5). A manual scan sends no location (P7) | Both need a business decision first | Ask the business owner |
| K8 | `docs/runbooks/frontend-mock-mode.md` still names `.js` files (`UserTab.js`, `src/index.jsx`, `mocks/handlers/<domain>.js`) and the old clear rule (status 3 only). The code is TypeScript now | Misleading paths in the runbook | Update the runbook |
| K9 | `service/start_rfid.vbs` has a hard-coded path (`D:\RFID_AYT_ASSY\service`) | Breaks on any other machine | Fix when the reader service is touched |
| K10 | No roles or auth: `emp_id` comes from the request body (spec risk R1) | Anyone on the network can act as any user | B6 or a separate auth spec |

## Rules of the house

- One task at a time: plan, review, build, review the diff, then the next task. About 5 files or 300 lines per task.
- Every endpoint change updates its Bruno request in the same change.
- Every flow someone runs by hand (migration, seed, job) gets a runbook in `docs/runbooks/`.
- Unit tests never touch a real DB or API. Integration tests run on the dev DB only.
- Schema changes are reviewed up/down SQL, run by a person. Never on prod without review.
- Backend layers and naming: `backend/README.md`. `modules/master/` is the reference module.
- `backend/CLAUDE.md` imports `backend/README.md` for Claude Code users.

## Gotchas

- `npm test` in `backend/` runs unit tests only. `npm run test:integration` needs `backend/.env` and refuses any `DB_NAME` that does not end with `_dev`.
- `create_assy_core.down.sql` drops all 12 tables, **including all users**. No user is seeded. Create the first one with Bruno `User - Create` (see the dev DB runbook).
- ESLint ignores `routes/` and `services/` (legacy).
- A `npm run build` in `frontend/` fails if any mock code ends up in the bundle. That is intended.
- If git shows "dubious ownership", see the root `README.md`.

## Contacts and access

| Need | Who / where |
| --- | --- |
| Business rules (clear rule, location on manual scan, dashboard needs) | TODO |
| AS400 / done API / machine API (URLs, token) | TODO (IT) |
| Dev SQL Server access and `.env` values | TODO |
| RFID readers on the line (IPs, `reader_config.json`) | TODO |
| GitHub repo access | TODO |