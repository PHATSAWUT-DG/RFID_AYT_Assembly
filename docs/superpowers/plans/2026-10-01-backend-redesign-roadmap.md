# Backend Redesign — Roadmap

- Spec: `docs/superpowers/specs/2026-10-01-backend-redesign-design.md` (Draft v3)
- Branch: `ayt-rfid`
- How this file works: one line per task, for every branch. Only the branch that is starting gets a detailed step-by-step plan (`2026-10-01-b<N>-<name>.md`). The detail for later branches is written when they start, against the code that exists by then.
- Execution: inline, one task at a time, you review each diff before the next task (`superpowers:executing-plans`). No subagents.
- Every task: unit tests I can run, Bruno request for each endpoint it touches, runbook for any flow you run yourself, old route handlers it replaces deleted in the same task.

## Status

| Branch | Plan file | Status |
| --- | --- | --- |
| B0 Foundation | `2026-10-01-b0-foundation.md` | [ ] |
| B1 Master data | written when B0 is done | [ ] |
| B2 Register / pair | written when B1 is done | [ ] |
| B3 Scan | written when B2 is done | [ ] |
| B4 Clear | written when B3 is done | [ ] |
| B5 Query / dashboard | written when B4 is done | [ ] |
| B6 Existing modules | — | [-] DEFERRED — own spec after B0; resume: short spec for users / login / API log in the new layers |
| B7 FE switch | — | [-] DEFERRED — FE work after B5; resume: FE plan that moves screens to the new endpoints, plus the abnormal-scan toast from `EventSource` on `GET /events/stream` (spec D22, 7.10), mounted once in the layout; dashboard reloads on `lots.changed` (1 s debounce, reload on reconnect) and the 3-minute polling in `Dashboard.tsx` is removed; mock mode needs an SSE mock |

---

## B0 Foundation

| # | Task | Main files | Model / effort / where | Status |
| --- | --- | --- | --- | --- |
| B0.1 | Lazy DB pool: no connection at `require` time, retry after a failed connect | `database.js`, `db.js`, `routes/assembly.js`, `scripts/rehash_passwords.js` | Sonnet 5, medium | [x] `database.js:15` `getPool`/`createPoolGetter`; callers switched; 3 new + 33 total unit tests pass |
| B0.2 | `AppError` + central error handler | `shared/AppError.js`, `shared/errorHandler.js` | Sonnet 5, medium | [x] `shared/errorHandler.js:11`; 7 new + 40 total unit tests pass |
| B0.3 | `validate()` (zod) + `sqlErrors` | `shared/validate.js`, `shared/sqlErrors.js`, `package.json` | Sonnet 5, medium | [x] `shared/validate.js:8`, `shared/sqlErrors.js:6`; 8 new + 48 total unit tests pass |
| B0.4 | `app.js` / `server.js` split, old polling removed, JSON 404, HTTP test helper | `app.js`, `server.js`, `test/helpers/startApp.js` | Sonnet 5, medium | [~] code done (`app.js:6`, `server.js`); 6 new + 54 total unit tests pass; user smoke test of `node server.js` pending |

Where: one **new session (Sonnet 5, medium)** for B0.1–B0.4. Handoff: "Execute `docs/superpowers/plans/2026-10-01-b0-foundation.md` with `superpowers:executing-plans`, inline, one task at a time, wait for my review after each."

## B1 Master data

| # | Task | Main files | Model / effort / where | Status |
| --- | --- | --- | --- | --- |
| B1.1 | Up / down SQL for all new tables + seed (spec 5.2, 5.3). You review and run it. | `backup_DB_SP/create_assy_core.sql`, `.down.sql`, `scripts/setup_dev_database.sql` | Opus 5.5, high — main session | [ ] |
| B1.2 | `master/processes` CRUD + Bruno. Delete old `/process` handlers. | `modules/master/*` | Sonnet 5, medium | [ ] |
| B1.3 | `master/locations` CRUD (`is_active` instead of delete) + Bruno | `modules/master/*` | Sonnet 5, medium | [ ] |
| B1.4 | `master/statuses` CRUD: system statuses, CLEARED ⇔ no location rule, one status per location + Bruno. Delete old `/status` handlers, `services/masterService.js`, its test, and old master SP files. | `modules/master/*` | Sonnet 5, high | [ ] |

Where: B1.1 in the main session (migration needs our discussion). B1.2–B1.4 in one new session (Sonnet 5).

## B2 Register / pair

| # | Task | Main files | Model / effort / where | Status |
| --- | --- | --- | --- | --- |
| B2.1 | `httpLogger` + API log repository (rules in spec 8.4) | `clients/httpLogger.js` | Sonnet 5, medium | [ ] |
| B2.2 | `as400Client.fetchLot` + mock route `/mock/as400/lot/:lot_no` | `clients/as400Client.js`, `modules/mock/*` | Sonnet 5, medium | [ ] |
| B2.3 | Pairing repository: lot upsert / lock, tag get-or-create, insert pairing, `moveStatus` (the only state writer). Integration tests you run. | `modules/pairing/repository.js` | Opus 5.5, high | [ ] |
| B2.4 | `pairingService.pair` + `POST /pairings` + Bruno. Race → 409 mapping. Delete old `/register-tag`. | `modules/pairing/*` | Opus 5.5, high | [ ] |
| B2.5 | `GET /lots/lookup/:lot_no`, `PATCH /tags/:tag_code` + Bruno. Delete old `/lot/:lot_no`. | `modules/pairing/*` | Sonnet 5, medium | [ ] |

Where: B2.1–B2.2 new session (Sonnet 5). B2.3–B2.4 main session (Opus, concurrency). B2.5 same session as B2.4.

## B3 Scan

| # | Task | Main files | Model / effort / where | Status |
| --- | --- | --- | --- | --- |
| B3.1 | Unknown read upsert (UPDATE → INSERT → retry on 2601/2627) | `modules/scan/repository.js` | Sonnet 5, medium | [ ] |
| B3.2 | `scanService` + `POST /scans` (per-tag transaction, MOVED / SEEN / UNKNOWN / ERROR, abnormal flag per spec D22) + Bruno. Delete old `/gauging-room-f1`, `/mc-gauging-f1`, `/change-process`. `service/main_assy.py` stops working here (O4). | `modules/scan/*` | Sonnet 5, high | [ ] |
| B3.3 | Live events: `shared/eventBus.js`, `GET /events/stream` (SSE, spec 7.10: publish after commit, `Last-Event-ID` backfill, ping, clean-up) + Bruno. `scanService` publishes `scan.abnormal` and one `lots.changed` per batch; `pairingService.pair` publishes `lots.changed`. | `shared/eventBus.js`, `modules/events/*`, `modules/scan/service.js` | Sonnet 5, high | [ ] |
| B3.4 | Mock reader: `service/mock_reader.py` posts fake scans to `POST /scans` from scenarios (normal move, forward skip, backward move, duplicate read, unknown tag). Replaces `main_assy.py` for dev until the reader service phase. + runbook `docs/runbooks/mock-reader.md` | `service/mock_reader.py` | Sonnet 5, medium | [ ] |

Where: one new session (Sonnet 5, high) for B3.1–B3.3. B3.4 in a new session (Sonnet 5, medium).

## B4 Clear

| # | Task | Main files | Model / effort / where | Status |
| --- | --- | --- | --- | --- |
| B4.1 | `doneClient.isLotDone` + mock done routes (lookup + list / add / delete). Replaces `services/mockService.js` and old `/mock-done` handlers. + Bruno | `clients/doneClient.js`, `modules/mock/*` | Sonnet 5, medium | [ ] |
| B4.2 | `pairingService.autoClear` + `manualClear` + `POST /lots/:lot_no/clear` + Bruno. Delete old `/completed`. Manual clear publishes `lots.changed` after commit (spec 7.10). | `modules/pairing/*` | Opus 5.5, high | [ ] |
| B4.3 | `autoClearJob` (overlap guard, concurrency, summary log, one `lots.changed` per run with at least one clear) + wiring in `server.js` + runbook `docs/runbooks/auto-clear-job.md` | `jobs/autoClearJob.js` | Sonnet 5, high | [ ] |

Where: B4.1 new session (Sonnet 5). B4.2–B4.3 main session (Opus; concurrency and job).

## B5 Query / dashboard

| # | Task | Main files | Model / effort / where | Status |
| --- | --- | --- | --- | --- |
| B5.1 | `GET /lots/:lot_no`, `GET /tags/:tag_code`, `GET /lots/:lot_no/journey` (flat, oldest first) + Bruno. Delete old `/lot-by-lot`, `/lot-by-tag`. | `modules/query/*` | Sonnet 5, medium | [ ] |
| B5.2 | `GET /lots`, `GET /events`, `GET /unknown-reads` (filters, paging) + Bruno. Delete old `/clear-tag/history`, `/dashboard/history`. | `modules/query/*` | Sonnet 5, medium | [ ] |
| B5.3 | `machineClient` (60 s cache, 10 min stale fallback) + mock `/mock/machines` | `clients/machineClient.js` | Sonnet 5, medium | [ ] |
| B5.4 | `GET /dashboard/summary`, `/by-process`, `/inventory` + Bruno. Delete old dashboard handlers. | `modules/query/*` | Sonnet 5, medium | [ ] |

Where: one new session (Sonnet 5, medium) for all of B5.

---

## Open items (decide when the branch starts)

| # | Item | When | Status |
| --- | --- | --- | --- |
| O1 | You dropped all tables, so `tb_assy_login` and `tb_assy_api_log` are gone too. Login is broken until it is recreated. Proposal: the B1.1 script also recreates `tb_assy_api_log` and the two mock tables (B2 / B4 need them); `tb_assy_login` is recreated in the same script with its old columns, so login works again before B6. | B1.1 | [ ] |
| O2 | Spec section 2 says `routes/assembly.js` is empty after B5. It is not: the reader routes (`/readers-*`) and login / users stay until the reader phase and B6. Update the spec line at B5. | B5 | [ ] |
| O3 | Spec section 9 gets a new code `ROUTE_NOT_FOUND` (404) in B0.4, so old FE calls get JSON, not an HTML page (R7). | B0.4 | [x] added to spec section 9 table (`design.md:553`) |
| O4 | B3.2 deletes `/gauging-room-f1` and `/mc-gauging-f1`. The running Python reader (`service/main_assy.py`) and `ScanTag.tsx` call them, and spec section 1 puts the reader service out of scope. After B3.2 no scan moves a lot. Decide: keep the old endpoints as adapters over `scanService`, or ship the new reader service with B3. | Before B3.2 | [x] Decided 2026-10-26: no adapter. The system is not launched, so B3.2 deletes the old endpoints and `main_assy.py` stays broken until the reader service phase (spec section 1) |
| O5 | D5 lets a scan skip a stage or go back. Users must see it. | B3.2, B3.3, B7 | [x] Decided 2026-10-26: spec D22. The event is flagged `is_abnormal`, the BE pushes it over SSE (B3.3, spec 7.10), and the FE shows a toast (B7) |
