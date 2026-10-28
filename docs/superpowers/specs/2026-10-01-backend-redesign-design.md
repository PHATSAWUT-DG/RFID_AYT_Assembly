# Backend Redesign — Lot / Tag Journey (Design Spec)

- Date: 2026-10-01
- Branch: `ayt-rfid`
- Status: **Draft v3 — waiting for review** (v3: status moved to the lot, `is_terminal` dropped, API log kept)
- Scope: branches B0–B5 (see section 2). B6 and B7 get their own short specs later.

---

## 1. Goal

Rebuild the backend data model and flow from zero.

- One source of truth for: "which tag is on this lot now, and where is it".
- Full journey of every lot: every pair, scan and clear.
- A new process or location later = new master rows, not a schema change.
- All business rules in Node services (route → controller → service → repository). No stored procedures.

Context: the old flow never ran in production. Old tables and SPs are already dropped from the dev DB. There is no data to migrate.

### Out of scope (this spec)

- Roles / auth. `emp_id` comes from the request body (see Risks R1).
- Reader service (the program that talks to the RFID readers). We only define the scan endpoint it will call. The current `service/main_assy.py` calls the old endpoints, so it stops working at B3.2. That is accepted: the system is not launched. It is replaced in the reader service phase. Until then, scans come from a mock reader script (B3.4) against the dev DB with fake data.
- Frontend changes. FE moves to the new API in B7. Until then, FE runs in mock mode.
- Users / login / API log refactor into the new layers (B6).

---

## 2. Branches

| # | Branch | Duty | Status |
| --- | --- | --- | --- |
| B0 | Foundation | Folder layout, error handling, validation, app/server split, test helpers. Removes the old polling in `server.js` (it queries tables that no longer exist); B4 adds the new job. | [ ] |
| B1 | Master data | Process, location, status. Admin CRUD. | [ ] |
| B2 | Register / pair | AS400 lot client, lot snapshot, tag auto-create, pair, tag retire | [ ] |
| B3 | Scan (journey) | Scan endpoint, rule "last scan wins", unknown reads | [ ] |
| B4 | Clear | Done API client, auto clear (job) + runbook, manual clear (web) | [ ] |
| B5 | Query / dashboard | Lot state, journey, events, dashboard, machine API client + cache | [ ] |
| B6 | Existing modules | Users / login / API log → new layers. No behavior change. | [-] DEFERRED — separate refactor after B0 |
| B7 | FE switch | FE screens move to the new endpoints; remove leftover old route code | [-] DEFERRED — FE work, own plan after B5 |

Build order: B0 → B1 → B2 → B3 → B4 → B5. One implementation plan per branch.
Each branch deletes the old route handlers in `backend/routes/assembly.js` that it replaces, in the same task. When B5 is done, the file is empty and gets deleted.

---

## 3. Decision log

All confirmed with you.

| # | Decision |
| --- | --- |
| D1 | Pairing is 1 lot ↔ 1 tag at a time. Tags are reused after the pair closes. |
| D2 | Status belongs to the **lot** (where the lot is). The pairing only says which tag carries the lot, and when. Every status change writes an event row. |
| D3 | Stage 1 "before register" is virtual. No row in our DB. |
| D4 | One location belongs to exactly one process. |
| D5 | Scan rule: **last scan wins**. Going back (4 → 3) is allowed. `seq` sets display order and the normal scan order (D22). |
| D6 | Duplicate read (same location as the lot's current status) → no event, only update `tb_assy_lot.last_seen_at`. |
| D7 | Auto clear gate = external done API by `lot_no`. Found → clear. No status precondition. |
| D8 | Clear has two triggers: scheduled job (auto) and Clear Tag page (manual). |
| D9 | Done API is yes/no. Our event `created_at` is the clear time. |
| D10 | Lot row = AS400 snapshot + our state (status, last seen). One row per `lot_no`. Raw response stays in `tb_assy_api_log`. |
| D11 | Tag is created on first pair. `is_active` retires a damaged tag. "Free" is derived, not stored. |
| D12 | A pair closes only one way: **CLEARED**. No `CANCELLED` status. A wrong pair is fixed by manual clear with a remark. |
| D13 | Re-pair is always allowed when the lot has no active pair. |
| D14 | Machine no.: live call to machine API + in-memory cache. One WOS → many machines. |
| D15 | State + log: `lot.status_id` is the current state. `pairing_event` is append-only. Same transaction. |
| D16 | No stored procedures. Layers: route → controller → service → repository. |
| D17 | Manual clear is a **force** fallback for when auto clear can't finish. It does **not** call the done API. It needs: lot + tag are the active pair (checked in BE), `emp_id`, remark, and the pair's current process has `can_clear_tag = 1`. |
| D18 | `REGISTERED` maps to location **Before Gauging Room F1** (`bf_gr_f1`, process 1500). So every active status has a location and a process. |
| D19 | No `is_terminal` flag. `CLEARED` is the only closing status; code finds it by its code. Adding `CANCELLED` later needs a code change anyway (R8). |
| D20 | Invariant: lot status ≠ `CLEARED` **if and only if** the lot has an active pairing. Only `moveStatus` writes lot status and closes pairings, so both change together. |
| D21 | `tb_assy_api_log` stays. The lot table keeps only the latest mapped data; the log keeps every call (raw response, HTTP status, error, duration) for all three upstream APIs. |
| D22 | **Abnormal scan** (added 2026-10-26). A `SCANNED` move is abnormal when its target is not the next active status after the lot's current one, ordered by `seq` (`CLEARED` excluded). This covers a forward skip (`REGISTERED` → `MC_F1`) and every backward move (`MC_F1` → `GR_F1`). The lot still moves (D5). The event gets `is_abnormal = 1`. The BE pushes it to the FE over SSE (7.10), and the FE shows a toast. `PAIRED` and `CLEARED` events are never abnormal. A duplicate read (D6) writes no event, so it is never abnormal. |
| P2 | Table names keep the `tb_assy_` / `tb_master_` prefix. Old tables are already dropped, so the names are free. |
| P3 | API base stays `/api/assembly` with new resource paths. No `/v2`. |
| P4 | Feature folders: `modules/<feature>/<resource>/<resource>.{routes,controller,service,repository,schemas}.js` (one folder per resource). |
| P5 | Request validation with **zod** at the route boundary. |
| P6 | Unknown-tag reads go to their own table, with a counter (one row per tag + location). |
| P7 | Pair always re-fetches the lot from AS400 in the BE. The client sends only `lot_no` + `tag_code` + `emp_id`. |
| P8 | Mock upstream APIs are routes in our backend (`/api/assembly/mock/...`), mounted only when `ENABLE_MOCK_ROUTES=true`. Dev env points the API URL env vars at them. This phase builds the business logic against mocks; real API integration comes later. |
| P9 | `can_clear_tag` on process stays. It gates manual clear (D17). Auto clear ignores it this phase. See Future F1. |
| P10 | All timestamps use DB time (`SYSDATETIME()`), `DATETIME2`. |

---

## 4. Lot lifecycle

```text
(1) BEFORE REGISTER  -- virtual, lot only in AS400
        |
        |  pair (web, at Before Gauging Room F1)
        v
(2) REGISTERED  <------>  (3) GR_F1  <------>  (4) MC_F1
        |       scan any location: last scan wins, any direction
        |                     |                     |
        +---------------------+---------------------+
                              |
                              |  clear:  auto (job, done API found the lot)
                              |       or manual (web, force, remark required)
                              v
                      (5) CLEARED  -- pair closed; lot can be paired again (D13)
```

- Active pair = `closed_at IS NULL`.
- Clear works from any active status (2, 3 or 4). Manual clear also needs `can_clear_tag` on that status's process.
- After a pair closes, the tag is free. A read of that tag becomes an "unknown read".
- The lot's displayed stage:
  - Lot row exists → `tb_assy_lot.status_id`.
  - Not in our DB → stage 1 (virtual).

---

## 5. Data model

### 5.1 ERD

```mermaid
erDiagram
    tb_master_process ||--o{ tb_master_location : has
    tb_master_location ||--o| tb_master_assy_status : "maps to (0..1)"
    tb_assy_lot ||--o{ tb_assy_pairing : has
    tb_assy_tag ||--o{ tb_assy_pairing : has
    tb_master_assy_status ||--o{ tb_assy_lot : "current status"
    tb_assy_pairing ||--o{ tb_assy_pairing_event : journey
    tb_master_location ||--o{ tb_assy_pairing_event : "where"
    tb_master_location ||--o{ tb_assy_unknown_read : "where"
```

### 5.2 Tables

#### `tb_master_process`

Same columns as before, recreated:

| Column | Type | Rule |
| --- | --- | --- |
| id | INT IDENTITY | PK |
| process_code | VARCHAR(10) | NOT NULL, UNIQUE |
| process_name | VARCHAR(50) | NOT NULL |
| can_clear_tag | BIT | NOT NULL, default 0. Gates manual clear (D17). |

Seed: `1500 GAUGING`, `can_clear_tag = 1`.

#### `tb_master_location`

| Column | Type | Rule |
| --- | --- | --- |
| id | INT IDENTITY | PK |
| location_code | VARCHAR(20) | NOT NULL, UNIQUE. Same value the reader sends (e.g. `gr_f1`). |
| location_name | VARCHAR(100) | NOT NULL |
| process_id | INT | NOT NULL, FK → `tb_master_process.id` (D4) |
| is_active | BIT | NOT NULL, default 1. Scans at an inactive location are rejected. |
| created_at | DATETIME2(0) | NOT NULL, default `SYSDATETIME()` |

Seed (all process `1500`):

| location_code | location_name |
| --- | --- |
| `bf_gr_f1` | Before Gauging Room F1 |
| `gr_f1` | Gauging Room F1 |
| `mc_f1` | MC Gauging F1 |

#### `tb_master_assy_status`

| Column | Type | Rule |
| --- | --- | --- |
| id | INT IDENTITY | PK |
| status_code | VARCHAR(30) | NOT NULL, UNIQUE. Code refers to statuses by code, never by id. The API trims and upper-cases it and allows only `A-Z`, `0-9`, `_` (plan M8). |
| status_label | VARCHAR(50) | NOT NULL |
| seq | INT | NOT NULL. Display order and normal scan order (D5, D22). |
| location_id | INT NULL | FK → `tb_master_location.id`. Filtered UNIQUE `WHERE location_id IS NOT NULL` (one status per location). |

CHECK: `(status_code = 'CLEARED' AND location_id IS NULL) OR (status_code <> 'CLEARED' AND location_id IS NOT NULL)`.
Meaning: every active status has a location (D18), and a scan can never clear a lot (D19).

System statuses (seeded; the service blocks delete or a code change): `REGISTERED`, `CLEARED`.

Seed:

| seq | status_code | status_label | location |
| --- | --- | --- | --- |
| 2 | REGISTERED | Registered | `bf_gr_f1` |
| 3 | GR_F1 | Gauging Room F1 | `gr_f1` |
| 4 | MC_F1 | MC Gauging F1 | `mc_f1` |
| 5 | CLEARED | Cleared | — |

#### `tb_assy_lot`

| Column | Type | Rule |
| --- | --- | --- |
| id | INT IDENTITY | PK |
| lot_no | VARCHAR(15) | NOT NULL, UNIQUE |
| wos | VARCHAR(20) | NULL. 20, not 10: the machine API sample has 12 chars (`HD-123123123`). |
| brg_type | VARCHAR(30) | NULL |
| spec | VARCHAR(20) | NULL |
| qty | INT | NULL |
| fetched_at | DATETIME2(0) | NOT NULL. Last AS400 fetch. |
| status_id | INT | NOT NULL, FK → `tb_master_assy_status.id`. Current stage (D2). |
| status_updated_at | DATETIME2(0) | NOT NULL, default `SYSDATETIME()`. Last status change. |
| last_seen_at | DATETIME2(0) | NULL. Last reader read of the lot's tag (D6). |
| created_at | DATETIME2(0) | NOT NULL, default `SYSDATETIME()` |

Indexes: `IX_assy_lot_wos (wos)`, `IX_assy_lot_status (status_id) INCLUDE (qty, wos, brg_type)` (dashboard counts).

Two groups of columns, two writers:

- Snapshot (`wos`, `brg_type`, `spec`, `qty`, `fetched_at`): written on pair. Each new pair re-fetches from AS400 (P7).
- State (`status_id`, `status_updated_at`): written only by `moveStatus` (and the first insert on pair). `last_seen_at`: written by scan.

#### `tb_assy_tag`

| Column | Type | Rule |
| --- | --- | --- |
| id | INT IDENTITY | PK |
| tag_code | VARCHAR(50) | NOT NULL, UNIQUE |
| is_active | BIT | NOT NULL, default 1 |
| created_at | DATETIME2(0) | NOT NULL, default `SYSDATETIME()` |

#### `tb_assy_pairing` (the "basket": which tag carries which lot)

| Column | Type | Rule |
| --- | --- | --- |
| id | INT IDENTITY | PK |
| lot_id | INT | NOT NULL, FK → `tb_assy_lot.id` |
| tag_id | INT | NOT NULL, FK → `tb_assy_tag.id` |
| paired_by | VARCHAR(10) | NOT NULL. emp_id. |
| paired_at | DATETIME2(0) | NOT NULL, default `SYSDATETIME()` |
| closed_at | DATETIME2(0) | NULL. NULL = active. |
| closed_by | VARCHAR(10) | NULL. emp_id for manual clear, NULL for the job. |

Indexes:

| Name | Columns | Purpose |
| --- | --- | --- |
| `UX_pairing_active_lot` | `(lot_id) WHERE closed_at IS NULL` | Max one active pair per lot (D1) |
| `UX_pairing_active_tag` | `(tag_id) WHERE closed_at IS NULL` | Max one active pair per tag (D1) |
| `IX_pairing_lot` | `(lot_id, paired_at)` | Journey per lot |

Rule (D20): `closed_at` is set **if and only if** the lot moves to `CLEARED`. `moveStatus` does both in one transaction.

#### `tb_assy_pairing_event` (the journey, append-only)

| Column | Type | Rule |
| --- | --- | --- |
| id | BIGINT IDENTITY | PK |
| pairing_id | INT | NOT NULL, FK |
| event_type | VARCHAR(20) | NOT NULL. CHECK in (`PAIRED`, `SCANNED`, `CLEARED`) |
| from_status_id | INT NULL | FK. Lot status before the change. NULL for the first `PAIRED` of a new lot; `CLEARED` on a re-pair. |
| to_status_id | INT | NOT NULL, FK |
| location_id | INT NULL | FK. Set for `PAIRED` (`bf_gr_f1`) and `SCANNED`. NULL for `CLEARED`. |
| source | VARCHAR(10) | NOT NULL. CHECK in (`web`, `reader`, `job`) |
| emp_id | VARCHAR(10) | NULL. NULL for `reader` and `job`. |
| remark | VARCHAR(255) | NULL. Required for manual clear (service rule). |
| is_abnormal | BIT | NOT NULL, default 0. Set by scan only (D22). |
| created_at | DATETIME2(3) | NOT NULL, default `SYSDATETIME()` |

Indexes: `IX_event_pairing (pairing_id, created_at)`, `IX_event_created (created_at) INCLUDE (event_type, to_status_id, is_abnormal)`.
No UPDATE or DELETE on this table, ever.

#### `tb_assy_unknown_read` (P6)

| Column | Type | Rule |
| --- | --- | --- |
| id | INT IDENTITY | PK |
| tag_code | VARCHAR(50) | NOT NULL |
| location_id | INT | NOT NULL, FK |
| first_seen_at | DATETIME2(0) | NOT NULL |
| last_seen_at | DATETIME2(0) | NOT NULL |
| read_count | INT | NOT NULL, default 1 |

UNIQUE `(tag_code, location_id)`. Upsert: UPDATE first; if 0 rows, INSERT; on duplicate-key error (2601/2627) retry the UPDATE once.

When it happens: a reader reads a tag with no active pair. For example, a tray goes in before it is registered, a tag stays on a tray after clear, or a foreign tag passes the reader.

#### Other tables (created by `create_assy_core.sql`, owned by their own modules)

The old tables were dropped with the rest. B1.1 recreates them (roadmap O1) with the old columns, widened, and `DATETIME2`:

| Table | Columns | Owner |
| --- | --- | --- |
| `tb_assy_login` | `id`, `emp_id VARCHAR(10) NOT NULL UNIQUE`, `eng_name`, `eng_surname`, `password VARCHAR(72) NOT NULL` (bcrypt), `position`. No user is seeded. | B6 |
| `tb_assy_api_log` | `id BIGINT`, `api_type`, `method`, `url`, `request_params`, `request_body VARCHAR(MAX)`, `http_status`, `status`, `response VARCHAR(MAX)`, `error_msg`, `response_time_ms`, `created_at DATETIME2(3)`. Same names as `services/apiLogService.js`. All external API calls are logged here (D21, 8.4). | B2.1 (may change it) |
| `tb_assy_mock_as400` | `lot_no` (NOT NULL, UNIQUE), `wos`, `brg_type`, `spec`, `qty`, `created_at`. Widths match `tb_assy_lot`. Dev-only (P8). | B2.2 |
| `tb_assy_mock_done` | `lot_no` (NOT NULL, UNIQUE), `created_at`. Dev-only (P8). | B4.1 |

### 5.3 SQL delivery

- Up: `backend/sql/create_assy_core.sql`. Down: `create_assy_core.down.sql`. Same pattern as `alter_process_can_clear_tag.sql`, except: no `USE` line (you select the target DB first, because `DB_NAME` differs per machine).
- The up script runs as one transaction (`SET XACT_ABORT ON`). If any of its tables already exists, it prints an error and changes nothing.
- Seed (process, locations, statuses) is in the up script. It looks up ids by code, never by literal id.
- `backend/scripts/setup_dev_database.sql` only creates the empty dev database. The schema lives only in `create_assy_core.sql`. Steps: `docs/runbooks/dev-database-setup.md`.
- You run all SQL yourself. I show the up/down SQL first and never run it.
- The down script drops the new tables. It needs your explicit OK each time it runs.
- Filtered indexes need `ANSI_NULLS ON` and `QUOTED_IDENTIFIER ON` on writing sessions. The `mssql` driver default is ON. The script header notes it.
- Old SP files in `backend/sql/dbo.*.sql` for tables that no longer exist get deleted from the repo in the branch that replaces them.

---

## 6. Backend structure (B0)

```text
backend/
  app.js                    express app: middleware, /api/assembly router, error handler. No listen().
  server.js                 listen() + start jobs
  db.js                     existing: query(), transaction(), typed()
  shared/
    AppError.js             AppError(code, httpStatus, message, details?)
    errorHandler.js         AppError → { error: { code, message, details?, request_id } }; unknown → 500 INTERNAL (logged)
    validate.js             validate({ params, query, body }) middleware using zod
    sqlErrors.js            isUniqueViolation(err) → 2601 / 2627
  clients/
    as400Client.js          fetchLot(lotNo) → snapshot | null
    doneClient.js           isLotDone(lotNo) → boolean
    machineClient.js        listWosMachines() → [{ wos, mc_no, part_no, spec }], 60 s cache
    httpLogger.js           wraps an axios call + writes tb_assy_api_log
  modules/
    master/                 processes, locations, statuses
      index.js              createMasterModule({ db }) -> router; the only public file
      master.errors.js      toMasterError, withMasterErrors, orNotFound, assertAffected
      master.schemas.js     idParams (shared by the three resources)
      processes/            processes.{routes,controller,service,repository,schemas}.js
      locations/            locations.*.js (no delete)
      statuses/             statuses.*.js
    pairing/                pair, clear, tag retire (service owns all state changes)
    scan/                   scan
    query/                  lots, journey, events, dashboard
    mock/                   mock upstream routes (P8)
  jobs/
    autoClearJob.js
```

Each module has an `index.js` and one folder per resource. A resource folder has `<resource>.routes.js`, `.controller.js`, `.service.js`, `.repository.js` and `.schemas.js`. Code shared by the resources of one module sits next to `index.js` as `<module>.<topic>.js`. Deleting a resource means deleting its folder.

| Layer | Does | Does not |
| --- | --- | --- |
| routes | path + `validate(schema)` + controller | logic |
| controller | read `req`, call service, send status + JSON | SQL, rules, try/catch for 500 |
| service | rules, transactions, call clients | `req` / `res`, raw SQL |
| repository | parameterized SQL via `db` / `txDb` | rules |

Rules:

- **Dependency injection**: `createPairingService({ db, repo, as400Client, doneClient })`. Unit tests pass fakes.
- **Express 5**: rejected promises reach the error handler on their own. No `asyncHandler` wrapper.
- **One writer for state**: only `pairingRepository.moveStatus(txDb, { lotId, pairingId, fromStatusId, toStatus, eventType, locationId, source, empId, remark, isAbnormal = false })` does all three, in the given transaction:
  1. Updates `tb_assy_lot.status_id` + `status_updated_at`.
  2. If `toStatus` is `CLEARED`: sets the pairing's `closed_at` / `closed_by` (D20).
  3. Inserts the event.
- **Current state vs history**: current status is read **only** from `tb_assy_lot.status_id`. Events are history; no code reads "the latest event" to decide the current status. `lot.status_id` is a stored copy of the latest event's `to_status_id`, kept in step by `moveStatus` (D15).
- **Locking**: every state change locks the **lot row** first (`WITH (UPDLOCK, ROWLOCK)`). So pair, scan and clear on the same lot always run one after another. The unique indexes stay the final guard.
- **No HTTP call inside a DB transaction.** Call the external API first, then open the transaction and re-check.

---

## 7. Flows

All paths below are under `/api/assembly`.

### 7.1 Lookup lot (preview, no save) — B2

`GET /lots/lookup/:lot_no`

1. `as400Client.fetchLot(lot_no)`. Null → 404 `LOT_NOT_FOUND`. Error → 502 `UPSTREAM_ERROR`.
2. Read our lot + active pairing (if any).
3. Return the snapshot + `active_pairing` (or null). FE uses it to warn "lot already paired".

### 7.2 Pair — B2

`POST /pairings` body `{ lot_no, tag_code, emp_id }`

1. `as400Client.fetchLot(lot_no)`. Null → 404 `LOT_NOT_FOUND`. Error → 502 `UPSTREAM_ERROR`.
2. Transaction:
   1. Lot by `lot_no` (lock).
      - Exists and status ≠ `CLEARED` → 409 `LOT_ALREADY_PAIRED` (with `tag_code`).
      - Exists and `CLEARED` → update the snapshot (`fetched_at = now`).
      - Not exists → insert lot with the snapshot and status `REGISTERED`.
   2. Get or create the tag. `is_active = 0` → 409 `TAG_INACTIVE`.
   3. Active pair on this tag → 409 `TAG_IN_USE` (with `lot_no` of the other lot).
   4. Insert pairing.
   5. `moveStatus` → `REGISTERED`, event `PAIRED` (`source = web`, `location_id` = `bf_gr_f1`, from = `CLEARED` on re-pair, NULL for a new lot).
   6. Unique violation from a race (`lot_no`, or an active-pair index) → map to `LOT_ALREADY_PAIRED` / `TAG_IN_USE`.
3. 201 with the lot view (7.7).

### 7.3 Retire tag — B2

`PATCH /tags/:tag_code` body `{ is_active }`. Retire with an active pair → 409 `TAG_IN_USE`.

### 7.4 Scan — B3

`POST /scans` body `{ location_code, tag_codes: string[] }` (1–200 codes)

Batch, because one reader cycle sees many tags, and 60+ readers are planned (comment in `server.js`).

1. Location by code. Not found or inactive → 404 `LOCATION_NOT_FOUND`.
2. Status for the location. None → 422 `LOCATION_HAS_NO_STATUS`.
3. Remove duplicate codes in the batch. Then for each tag code, **its own transaction**:
   - Find the active pairing by tag code, then lock its lot. None → upsert unknown read → outcome `UNKNOWN`.
   - `lot.status_id == location status` → update `lot.last_seen_at` → outcome `SEEN` (D6).
   - Else → `moveStatus` to the location status, event `SCANNED`, `source = reader`, set `lot.last_seen_at` → outcome `MOVED` (D5, any direction). The service sets `isAbnormal` by the D22 rule; it is a pure function of the status list, the current status and the target status, unit-tested for: next status (normal), forward skip, backward move, move from the last active status.
   - Any error on one tag → outcome `ERROR` with code. Other tags go on.
4. 200 `{ data: { location_code, results: [{ tag_code, outcome, lot_no?, from_status?, to_status?, abnormal?, error? }] }`. `abnormal` is set only on `MOVED`. `}` closes `data`.

### 7.5 Clear — B4

Both triggers end in the same repository call: `moveStatus(... toStatus: CLEARED, eventType: CLEARED ...)`.

#### Auto clear (job) — `pairingService.autoClear(lotId)`

1. Read the lot (no lock). `CLEARED` → skip.
2. `doneClient.isLotDone(lot_no)`. False → skip. Error → log, skip.
3. Transaction: lock the lot. `CLEARED` now (race) → skip.
4. `moveStatus` → `CLEARED` (closes the active pairing), `source = job`, no `emp_id`, no remark.

Job (`jobs/autoClearJob.js`):

| Setting | Env var | Default |
| --- | --- | --- |
| On / off | `AUTO_CLEAR_JOB_ENABLED` | `false` (on in exactly one instance) |
| Interval | `AUTO_CLEAR_JOB_INTERVAL_MS` | `60000` |
| Parallel calls | `AUTO_CLEAR_JOB_CONCURRENCY` | `5` |
| HTTP timeout | `DONE_API_TIMEOUT_MS` | `5000` |

- Overlap guard: skip a run if the last one is still going.
- Each run: all lots with status ≠ `CLEARED` → `autoClear(id)`.
- End of run: one log line `{ checked, cleared, errors, ms }`.
- Runbook: `docs/runbooks/auto-clear-job.md` (enable, change interval, check it runs, stop it).

#### Manual clear (web, force) — `pairingService.manualClear({ lotNo, tagCode, empId, remark })`

`POST /lots/:lot_no/clear` body `{ tag_code, emp_id, remark }`

1. Transaction: lot by `lot_no` (lock), with its active pairing.
   - Lot not in our DB → 404 `LOT_NOT_REGISTERED`.
   - Lot status is `CLEARED` (no active pair) → 409 `PAIRING_CLOSED`.
   - Active pairing's tag ≠ `tag_code` → 409 `TAG_LOT_MISMATCH`. The BE checks the match; the FE check is only UX.
   - Process of the lot status (status → location → process) has `can_clear_tag = 0` → 409 `PROCESS_NOT_CLEARABLE`.
2. `moveStatus` → `CLEARED`, `source = web`, `emp_id`, `remark`.
3. 200 with the lot view.

No done API call (D17). `remark` is required (1–255 chars).

### 7.6 Read views — B5

Paged lists (`GET /lots`, `GET /events`) return `{ data: [...], meta: { page, page_size, total } }`. Other read views return `{ data }`.

| Endpoint | Returns |
| --- | --- |
| `GET /lots/:lot_no` | Lot view (7.7): snapshot + status (location, process, `can_clear_tag`, `last_seen_at`) + active tag. Replaces `lot-by-lot`. |
| `GET /lots/:lot_no/journey` | Flat timeline of all events of the lot (all its pairings), `ORDER BY created_at ASC, id ASC`. Each row: `created_at`, `event_type`, `from_status`, `to_status`, `location_code`, `tag_code`, `source`, `emp_id`, `remark`. Lot not in our DB → 404 `LOT_NOT_REGISTERED`. |
| `GET /tags/:tag_code` | Tag + active pairing with lot. Replaces `lot-by-tag`. |
| `GET /lots` | Current-state list. Filters: `status`, `process`, `q` (lot / tag / WOS / brg_type), `active` (default true = status ≠ `CLEARED`), `page`, `page_size` (default 50, max 200) |
| `GET /events` | Event history. Filters: `from`, `to`, `event_type`, `source`, `location`, `abnormal`, `q` (lot / tag / emp / brg_type), `page`, `page_size`. Each row carries `is_abnormal`. The Clear Tag history tab = `event_type=CLEARED`. `abnormal=true` is for the history list; the live toast uses the stream (7.10). |
| `GET /unknown-reads` | Unknown reads. Filter: `location`. |
| `GET /dashboard/summary` | Lot count + qty per status (from `tb_assy_lot`, no pairing join) |
| `GET /dashboard/by-process` | Active qty per process (status → location → process) |
| `GET /dashboard/inventory` | Active lots grouped part (`brg_type`) → WOS: `{ part_no, wos, qty, lot_count, machines: string[] }` + `machines_available: boolean` |

Inventory merge: the repository returns WOS rows. The service attaches `machines` from `machineClient` (D14). If the machine API fails → `machines: []` and `machines_available: false`. The request does not fail.

### 7.7 Lot view (shared response shape)

```json
{
  "lot_no": "DEMO000001",
  "wos": "WOS2609001",
  "brg_type": "6204ZZCM",
  "spec": "SPEC-6204",
  "qty": 500,
  "status_code": "GR_F1",
  "status_label": "Gauging Room F1",
  "status_updated_at": "2026-10-01T08:20:00",
  "location_code": "gr_f1",
  "process_code": "1500",
  "can_clear_tag": true,
  "last_seen_at": "2026-10-01T08:20:00",
  "pairing_id": 12,
  "tag_code": "E28011700000020A1B2C3D4E",
  "paired_at": "2026-10-01T08:00:00"
}
```

When the lot is `CLEARED`: `location_code`, `process_code`, `can_clear_tag`, `pairing_id`, `tag_code`, `paired_at` are `null`.

### 7.8 Master data — B1

CRUD for `processes`, `locations`, `statuses`. Paths are plural and flat (plan M5).

| Method | Path | Success |
| --- | --- | --- |
| GET | `/processes`, `/locations`, `/statuses` | 200 `{ data: [...] }` |
| POST | `/processes`, `/locations`, `/statuses` | 201 `{ data: row }` (the new row) |
| PUT | `/processes/:id`, `/locations/:id`, `/statuses/:id` | 200 `{ data: row }` (the updated row). Full body, not a patch. |
| DELETE | `/processes/:id`, `/statuses/:id` | 204 |

`:id` must be a positive integer, else 400 `VALIDATION_ERROR`. There is no `DELETE /locations/:id`.

- Delete a row that is still referenced → 409 `MASTER_IN_USE`.
- System statuses (`REGISTERED`, `CLEARED`) cannot be deleted. Their code cannot change.
- The status CHECK rule (5.2) is checked in the request schema (zod `superRefine`), for a clear 400 `VALIDATION_ERROR` with `details[0].path = 'location_id'` (plan M7).
- A second status on a location, or a repeated `status_code` → 409 `MASTER_DUPLICATE`. `details[0].path` is `location_id` or `status_code`.
- Locations prefer `is_active = 0` over delete.

### 7.9 Mock upstream routes — B2 / B4 / B5 (P8)

Mounted only when `ENABLE_MOCK_ROUTES=true`. Same response shapes as the real APIs. They are not wrapped in `{ data }`, because they copy external APIs (section 9).

| Route | Backed by | Real env var it stands in for |
| --- | --- | --- |
| `GET /mock/as400/lot/:lot_no` | `tb_assy_mock_as400` | `API_RECEIVE_URL` |
| `GET /mock/done/:lot_no` | `tb_assy_mock_done` | `API_PROD_RESULT_URL` |
| `GET /mock/machines` | static fake list | `API_MACHINE_URL` (new) |

Plus the mock admin actions the Mock Done page uses (list / add / delete) under `/mock/done`.

### 7.10 Live events (SSE) — B3

`GET /events/stream` returns `text/event-stream`. One connection per browser tab. It is the only push channel: it pushes abnormal scans (D22) and tells the FE when lot counts change, so the dashboard is real-time.

**Rule for every publisher:** publish to the in-process bus (`shared/eventBus.js`, a Node `EventEmitter`) only **after** the transaction commits. A rolled-back change never reaches the FE.

Two message types:

| Event | `id` | Data | Published by |
| --- | --- | --- | --- |
| `scan.abnormal` | `<pairing_event.id>` | `{ lot_no, tag_code, from_status, to_status, location_code, created_at }` | `scanService`, once per abnormal `MOVED` tag |
| `lots.changed` | none | `{ source, count }` (`source` in `web`, `reader`, `job`; `count` = lots changed) | Once per committed request, never per tag: pair (7.2), one `POST /scans` batch with at least one `MOVED`, manual clear, one auto clear job run with at least one clear. `SEEN` and `UNKNOWN` do not change counts, so they do not publish. |

1. **Reconnect without loss.** The browser's `EventSource` reconnects on its own and sends `Last-Event-ID`. The stream first sends the `scan.abnormal` events with `id > Last-Event-ID` from the DB (max 100), then live ones. So a BE restart drops no toast. `lots.changed` has no `id` and no backfill: the FE reloads once on every (re)connect instead.
2. **Keep-alive:** a comment line `: ping` every 25 s.
3. **Clean-up:** remove the bus listener on `req.on('close')`.
4. **FE (B7):** on `lots.changed`, wait 1 s (debounce) and reload the dashboard once. The 3-minute polling is removed.

---

## 8. External APIs

### 8.1 AS400 lot API

- `GET ${API_RECEIVE_URL}/${lot_no}`, header `Authorization: ${API_TOKEN}`.
- Response: array. `[0]` missing → not found.
- Map: `lotNo → lot_no`, `wosNo → wos`, `brgType → brg_type`, `specNo → spec`, `qty → qty`.

### 8.2 Done API

- `GET ${API_PROD_RESULT_URL}/${lot_no}`, same header.
- `[0]` exists → done. Empty array or HTTP 404 → not done. Other errors → `UPSTREAM_ERROR`.

### 8.3 Machine API

- `GET ${API_MACHINE_URL}`. Response `{ results: [{ Machine, PartNo, WOS, Spec, CreateDate }] }`.
- Map: `Machine → mc_no`, `WOS → wos`, `PartNo → part_no`, `Spec → spec`.
- Cache: the whole list, in memory, `MACHINE_CACHE_TTL_MS` default `60000`. On error, serve the last good list if it is younger than 10 min. Else throw.

### 8.4 API logging

All three clients go through `httpLogger` → `tb_assy_api_log` (`api_type`: `RECEIVE`, `PROD_RESULT`, `MACHINE`).

- Web calls: log every call.
- Auto clear job: log only `found` and errors. Logging every "not done" check would write (active pairs × runs per hour) rows.
- Machine API: log only cache refreshes, not cache hits.

---

## 9. Errors

Success body: `{ "data": <row or array> }`, plus `"meta": { page, page_size, total }` on paged lists (`meta` is present only when it has content). `DELETE` returns 204 with no body.

Error body: `{ "error": { "code": "<CODE>", "message": "<text>", "details"?: {...}, "request_id": "<id>" } }`. The code strings below are unchanged. Only the body shape changed: the FE reads `error.code`, not a top-level `error`.

Not wrapped: the mock upstream routes (7.9, they copy external APIs), the SSE stream (7.10), and legacy `routes/assembly.js` handlers until their branch rewrites them. Errors that pass through `errorHandler` use the new shape everywhere, legacy paths included.

Every response carries an `X-Request-Id` header. An inbound `X-Request-Id` is kept if it matches `^[A-Za-z0-9._-]{1,64}$`, else it is replaced by a UUID. The 500 log line includes it.

| Code | HTTP | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | zod failed. `details` = field errors. |
| `LOT_NOT_FOUND` | 404 | AS400 has no such lot |
| `LOT_NOT_REGISTERED` | 404 | Lot not in our DB |
| `TAG_NOT_FOUND` | 404 | Tag not in our DB |
| `LOCATION_NOT_FOUND` | 404 | Unknown or inactive location |
| `ROUTE_NOT_FOUND` | 404 | No route matches under `/api/assembly` (e.g. FE still calls an old route, R7) |
| `TAG_IN_USE` | 409 | Tag has an active pair |
| `LOT_ALREADY_PAIRED` | 409 | Lot has an active pair |
| `TAG_INACTIVE` | 409 | Pair with a retired tag |
| `PAIRING_CLOSED` | 409 | Manual clear on a lot with no active pair |
| `TAG_LOT_MISMATCH` | 409 | Manual clear: the tag is not on this lot |
| `PROCESS_NOT_CLEARABLE` | 409 | Manual clear: current process has `can_clear_tag = 0` |
| `MASTER_IN_USE` | 409 | Delete a master row that other rows still reference (FK) |
| `MASTER_SYSTEM_LOCKED` | 409 | Change the code of, or delete, a system status (`REGISTERED`, `CLEARED`) |
| `MASTER_DUPLICATE` | 409 | Master code already exists, or a location already has a status. `details[0].path` = the field |
| `MASTER_NOT_FOUND` | 404 | Master row id not found (update / delete) |
| `MASTER_INVALID_REF` | 422 | `process_id` or `location_id` points to a row that does not exist |
| `LOCATION_HAS_NO_STATUS` | 422 | Scan at a location with no status mapped |
| `UPSTREAM_ERROR` | 502 | AS400 API failed or timed out (web calls) |
| `INTERNAL` | 500 | Anything else. Logged with stack. No internals in the body. |

---

## 10. Testing

| Layer | Test type | Who runs |
| --- | --- | --- |
| services | Unit tests, fake repos + fake clients (`node --test`, existing `test/unit`) | Me |
| clients | Unit tests, axios stubbed: mapping, not-found, error, cache TTL | Me |
| shared (errorHandler, validate) | Unit tests | Me |
| autoClearJob | Unit test with fake service + fake timer: overlap guard, skip rules, summary | Me |
| repositories | Integration tests against dev DB (`npm run test:integration`) | You |
| endpoints | Bruno requests | You |

Must-have service cases:

- Pair: happy path; lot not found; tag inactive; tag in use; lot already paired; unique race mapped to 409; re-pair after clear.
- Scan: unknown tag; same location (SEEN, no event); forward move; **backward move** (D5); one bad tag does not stop the batch; duplicate codes in the batch.
- Auto clear: not done → skip; done → cleared with `source = job`, no `emp_id`; race (closed between check and lock) → skip; upstream error → skip and count.
- Manual clear: no done API call; tag mismatch → 409; process not clearable → 409; no active pair → 409; missing remark → 400.
- Re-pair: a `CLEARED` lot pairs again → status `REGISTERED`, event `PAIRED` with from = `CLEARED`.
- Invariant: every status change writes exactly one event, in the same transaction.
- Invariant (D20): after every pair / scan / clear, lot status ≠ `CLEARED` ⇔ the lot has an active pairing. Unit test on `moveStatus` callers; integration test on the repository.

### Bruno

Requests in `bruno/AYT-RFID/`, one per endpoint, grouped by module. Fake data only. The old request files for removed routes are deleted in the same task. Each endpoint's Bruno file is done in the same task as the endpoint.

---

## 11. Risks(need to review again last review at 01-10-2026)

| # | Risk | Impact | Mitigation |
| --- | --- | --- | --- |
| R1 | `emp_id` comes from the client body. No auth (out of scope). | Anyone can act as anyone, including manual clear. | Known gap until the roles phase. Bruno docs mark it. |
| R2 | Scan endpoint has no auth. | Anyone on the network can move lots. | Same as R1. Reader auth comes with the reader service phase. |
| R3 | Auto clear job on two Node instances. | Double calls to the done API. No double clear (lock + closed check). | `AUTO_CLEAR_JOB_ENABLED` on one instance only. In the runbook. |
| R4 | Auto clear load grows with active pairs. | 1 HTTP call per active pair per run. | Concurrency 5, timeout 5 s. Revisit if active pairs > ~1,000 (e.g. check each pair less often). |
| R5 | Reader sends every raw read. | One DB write per read (`last_seen_at` / unknown counter). | The reader service should throttle (e.g. once per tag per location per N s). Contract note for that phase. |
| R6 | Machine API down. | Inventory shows no machines. | `machines_available: false` + 10-min stale fallback. |
| R7 | FE calls old routes until B7. | FE breaks against the real backend during B0–B5. | FE keeps working in mock mode. B7 switches it. |
| R8 | Wrong pairs are fixed by manual clear (D12). | Stage-5 counts include wrong pairs. | The remark and the journey show the truth. Adding a `CANCELLED` status later is additive (one master row + one service branch). |
| R9 | D20 spans two tables (lot status + pairing `closed_at`). The DB cannot enforce it. | A bug outside `moveStatus` could leave a lot "active" with no tag, or the reverse. | Only `moveStatus` writes both; lot row lock; invariant tests (section 10) with a check query: lots where status ≠ `CLEARED` and no active pairing, and the reverse. |
| R10 | SSE bus is in memory (7.10). | With two Node instances, a tab on instance A misses scans saved on instance B. | Fine under A4 (one instance). If that changes: DB poll in the stream handler, or a shared pub/sub. |
| R11 | `server.js:10` plans a compression middleware. Compression buffers the response. | SSE messages arrive late or never. | When compression is added, skip `text/event-stream`, or flush after each write. |

---

## 12. Assumptions

| # | Assumption | If wrong |
| --- | --- | --- |
| A1 | Machine API returns the full list in one call; small (hundreds of rows) | Switch to a sync job + table |
| A2 | Lot numbers fit `VARCHAR(15)` | Widen in the up script |
| A3 | Reader timestamps are not needed; server time at the scan request is good enough | Add optional `read_at` to the scan body |
| A4 | One Node instance in prod | In-memory machine cache is per instance (fine); the job flag still applies (R3) |
| A5 | No reader is installed at Before Gauging Room F1. A scan there (if one is added later) moves the pair back to `REGISTERED`, under rule D5, and is flagged abnormal (D22). | Fine as is. |

---

## 13. Future (not this phase)

| # | Note |
| --- | --- |
| F1 | The done API must later be able to answer **per process**, so auto clear can cover processes beyond gauging. This phase checks only the gauging process, and `isLotDone(lotNo)` has no process parameter. When it comes: add the parameter, and make auto clear respect `can_clear_tag` the way manual clear does. |
| F2 | `CANCELLED` status if reports need wrong pairs separated from real clears (R8). |
| F3 | Roles / auth for `emp_id` and for the scan endpoint (R1, R2). |
