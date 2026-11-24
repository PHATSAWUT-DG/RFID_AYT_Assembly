# RFID AYT Assembly

Tracks bearing lots through the assembly and gauging line at the NHT Bearing factory. Each lot is paired with an RFID tag. RFID readers on the line scan the tag, and the system records where the lot is. Supervisors and admins watch all lots on a web dashboard.

**Status (2026-11-24): in development, not launched.** The backend is being rebuilt. Start with [`docs/HANDOFF.md`](docs/HANDOFF.md).

## How it works

1. **Pair.** An operator scans the lot barcode. The backend fetches the lot info from AS400 (the factory ERP). The operator scans an RFID tag to pair it with the lot.
2. **Scan.** Readers at each location send tag reads to the backend. The lot moves to the status of that location. The last scan wins, in any direction. A skip or a move backward is flagged as abnormal.
3. **Clear.** When AS400 says the lot is done, a job clears the pair and the tag is free again. An admin can also force a clear on the Clear Tag page.

Statuses in the seed, in order: `REGISTERED` → `GR_F1` (Gauging Room F1) → `MC_F1` (MC Gauging F1) → `CLEARED`.

| Part | Folder | Stack | Duty |
| --- | --- | --- | --- |
| Frontend | `frontend/` | React 19, Vite 8, TypeScript, Tailwind, Vitest | Screens for operators and admins |
| Backend | `backend/` | Node 22, Express 5, `mssql` (raw SQL), zod, `node:test` | API, business rules, jobs |
| Database | `backend/sql/` | MS SQL Server (on-prem) | Lots, tags, pairings, events, master data |
| Reader service | `service/` | Python, FastAPI | Talks to the RFID readers, sends scans to the backend |
| API docs | `bruno/AYT-RFID/` | Bruno (YAML) | One request per endpoint |

## Run it locally

| What | Folder | Command | Notes |
| --- | --- | --- | --- |
| UI with fake data, no backend | `frontend/` | `npm install`, then `npm run dev:mock` | Fastest way to see the app. [Runbook](docs/runbooks/frontend-mock-mode.md) |
| UI against the real backend | `frontend/` | `npm start` | Port 3000. Copy `.env.example` to `.env` first |
| Backend unit tests | `backend/` | `npm install`, then `npm test` | Fully mocked, no DB needed |
| Backend server | `backend/` | `npm run dev` | Needs a dev DB. Default port 5001 |
| Dev database | — | — | [Runbook](docs/runbooks/dev-database-setup.md) |
| Integration tests | `backend/` | `npm run test:integration` | Dev DB only (`DB_NAME` must end with `_dev`). [Runbook](docs/runbooks/integration-tests.md) |
| Reader service | `service/` | `pip install -r requirements.txt`, then `python start_rfid.py` | Port 8001. Calls old endpoints; see HANDOFF known issues |

Checks before a change is done: `npm run lint`, `npm test` (both folders), plus `npm run typecheck` and `npm run build` in `frontend/`.

Env var names are in `backend/.env.example` and `frontend/.env.example`. Never commit `.env`.

**Git "dubious ownership" error:** if git refuses to run in this folder, the folder owner differs from your Windows user. Run `git config --global --add safe.directory <repo path>` once.

## Docs map

| Doc | Read it for |
| --- | --- |
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | Current state, next tasks, known issues. **Start here** |
| [`backend/README.md`](backend/README.md) | Backend folder map, layers, naming and rules |
| [`frontend/README.md`](frontend/README.md) | Frontend scripts |
| [Backend redesign spec](docs/superpowers/specs/2026-10-01-backend-redesign-design.md) | Data model, decisions D1–D22, API, error codes |
| [Backend roadmap](docs/superpowers/plans/2026-10-01-backend-redesign-roadmap.md) | Task list per branch (B0–B7) with status |
| [`docs/guides/db-error-handling.md`](docs/guides/db-error-handling.md) | How a SQL error becomes a JSON API error |
| `docs/runbooks/` | Step-by-step flows you run yourself |
| [`docs/archive/`](docs/archive/README.md) | Finished plans. History only, not open work |
