> **Out of date.** Written before the 2026-10-01 backend redesign. For the backend, see [backend/README.md](../backend/README.md) and the [redesign spec](../docs/superpowers/specs/2026-10-01-backend-redesign-design.md).

# RFID Assembly System — NHT BEARING

> Internal RFID tracking system for the Assembly line at NHT Bearing factory.
> Tracks bearing lots from registration through gauging processes to completion,
> with real-time monitoring via a web dashboard.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Tech Stack & Packages](#2-tech-stack--packages)
3. [System Architecture](#3-system-architecture)
4. [Project Structure](#4-project-structure)
5. [Database Schema](#5-database-schema)
6. [API Endpoints](#6-api-endpoints)
7. [Stored Procedures](#7-stored-procedures)
8. [Installation & Setup](#8-installation--setup)
9. [Environment Variables](#9-environment-variables)
10. [Features Status](#10-features-status)
11. [Pending / Blocked](#11-pending--blocked)
12. [Known Issues](#12-known-issues)
13. [Strengths & Weaknesses](#13-strengths--weaknesses)
14. [Recommendations](#14-recommendations)
15. [Authentication & Authorization](#15-authentication--authorization)
16. [Reader Configuration](#16-reader-configuration)
17. [Diagrams](#17-diagrams)

---

## 1. System Overview

| Item | Detail |
|------|--------|
| **System Name** | RFID Assembly System |
| **Plant** | NHT Bearing — Assembly Line |
| **Purpose** | Track bearing lots via RFID tags through assembly and gauging processes |
| **Users** | Factory operators (Register) and Admin (Management, Clear Tag, Dashboard) |
| **Volume** | ~1,000 lots/day |
| **Network** | Internal OT Network — not exposed to the internet |
| **DB Name** | `db_rfid_assembly` |
| **DB Auth** | Windows Authentication (Trusted Connection) |

### What the system does

- Operators scan a lot barcode → fetch lot info from AS400 → bind an RFID tag to the lot
- RFID readers on the conveyor automatically detect tag movement and update lot status
- Admin monitors status in real-time via the dashboard
- When a lot completes gauging, AS400 is polled to confirm → lot is automatically marked completed and tag is cleared for reuse
- Admin can manually clear a tag if needed (with reason and employee ID)

### Process Order — enforced at Stored Procedure level

```
Register (bf_issue)  →  Gauging Room F1 (gr_f1)  →  MC Gauging F1 (mc_f1)  →  Completed
   status_id=1              status_id=2                  status_id=3            status_id=4
```

Skipping steps is blocked at the database level. Readers that scan a tag in the wrong order receive `INVALID_PROCESS_ORDER` and skip silently.

---

## 2. Tech Stack & Packages

### Frontend — React (CRA)

```bash
cd frontend
npm install
npm install xlsx echarts echarts-for-react   # additional packages required
```

| Package | Purpose |
|---------|---------|
| `react` + `react-router-dom` v6 | UI framework + routing |
| `axios` | HTTP client |
| `tailwindcss` | CSS utility framework |
| `@ant-design/icons` | Icon components |
| `sweetalert2` | Alert / dialog popups |
| `xlsx` | Export Excel files ⚠️ install separately |
| `echarts` + `echarts-for-react` | Charts ⚠️ install separately |

### Backend — Node.js / Express

```bash
cd backend
npm install
```

| Package | Purpose |
|---------|---------|
| `express` | HTTP server |
| `cors` | Cross-origin resource sharing |
| `dotenv` | Environment variable loader |
| `axios` | HTTP client for AS400 API calls |
| `mssql/msnodesqlv8` | SQL Server driver with Windows Authentication |
| `msnodesqlv8` | Native SQL Server binding — required for Windows Auth |

> **Important:** This project uses **Windows Authentication** (`trustedConnection: true`).
> If you switch to SQL login, change `database.js` to standard `mssql` config with `user` and `password`.

### Python Service

```bash
cd service
pip install fastapi uvicorn httpx --break-system-packages
```

| Package | Purpose |
|---------|---------|
| `fastapi` | HTTP server for `/status` and `/restart` endpoints |
| `uvicorn` | ASGI server for FastAPI |
| `httpx` | HTTP client for calling Node.js |
| `sid_u861.py` | DLL wrapper — included in `/service/` |
| `SID_U861.dll` | Reader SDK — **32-bit only**, included in `/service/` |

> **Critical:** Python **must be 32-bit** because `SID_U861.dll` is 32-bit only.
> Using 64-bit Python causes `OSError: [WinError 193]`.
>
> Verify: `python -c "import struct; print(struct.calcsize('P') * 8)"` — must print `32`

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   OT NETWORK                            │
│                                                         │
│  ┌──────────┐  HTTP   ┌──────────┐  SQL  ┌──────────┐  │
│  │  React   │ ──────► │ Node.js  │ ────► │SQL Server│  │
│  │  :3000   │ ◄────── │  :5001   │       │          │  │
│  └──────────┘         └──────────┘       └──────────┘  │
│                           ▲  ▲                          │
│                           │  │ HTTP                     │
│  ┌────────────────┐        │  │                         │
│  │ Python Service │────────┘  │ REST API                │
│  │ FastAPI :8001  │           │ (firewall PENDING)      │
│  └────────────────┘        ┌──┴──────────────┐          │
│          │                 │ AS400 IT Network │          │
│          │ TCP :6000       │ - Lot Info API   │          │
│  ┌───────▼────────┐        │ - Gauge Result   │          │
│  │  RFID Readers  │        └────────────────┘          │
│  │  Reader 1 gr_f1│                                     │
│  │  Reader 2 mc_f1│                                     │
│  └────────────────┘                                     │
└─────────────────────────────────────────────────────────┘
```

| Component | Role |
|-----------|------|
| **Python** | Watches RFID readers 24/7, sends tag events to Node.js |
| **Node.js** | Receives events, updates DB, calls AS400 API, polls for completion |
| **SQL Server** | Stores all lot data and event history |
| **React** | UI for operators and admin |
| **AS400** | Factory ERP — source of lot info and completion confirmation |

---

## 4. Project Structure

```
RFID_AYT_ASSY/
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── Layout/
│       │   │   ├── Layout.js
│       │   │   ├── Sidebar.js      # Auto-expand on hover
│       │   │   ├── Navbar.js
│       │   │   └── Footer.js
│       │   ├── LoginModal.js
│       │   └── SecureRoute.js      # Route-level auth guard
│       ├── config/
│       │   ├── instance.js         # Axios baseURL
│       │   └── constance.js        # API base URL constant
│       └── pages/Assembly/
│           ├── Dashboard.js        # 2-tab: Summary + Detail
│           ├── RegisterSingle.js
│           ├── ClearTag.js         # 2-tab: Clear + History
│           ├── MockDone.js
│           ├── ReaderConfig.js
│           ├── Management.js       # 4-tab management
│           └── Management/
│               ├── UserTab.js
│               ├── StatusTab.js
│               └── ProcessTab.js
│
├── backend/
│   ├── routes/
│   │   └── assembly.js             # All API routes (SP-only, no inline SQL)
│   ├── database.js                 # SQL Server pool (Windows Auth)
│   ├── server.js                   # Express app + AS400 polling loop
│   └── .env
│
├── service/
│   ├── main_assy.py                # Python RFID service
│   ├── sid_u861.py                 # DLL wrapper
│   ├── start_rfid.py               # Auto-restart wrapper
│   ├── start_rfid.vbs              # Windows startup script
│   ├── SID_U861.dll                # 32-bit SDK DLL
│   └── reader_config.json          # Reader config (editable from web UI)
│
└── diagrams/
    ├── README_DIAGRAMS.md
    ├── 01_process_flow.mermaid
    ├── 02_er_diagram.mermaid
    ├── 03_architecture.mermaid
    ├── 04_python_service_flow.mermaid
    ├── 05_auth_flow.mermaid
    └── 06_polling_flow.mermaid
```

---

## 5. Database Schema

### Tables Overview

| Table | Purpose |
|-------|---------|
| `tb_assy_lot` | Main lot — current status, location, tag binding |
| `tb_assy_tag` | Tag lifecycle — active / cleared |
| `tb_assy_log` | Append-only event log — every status change |
| `tb_assy_wos` | Master WOS (Work Order Specification) |
| `tb_assy_login` | User accounts |
| `tb_assy_api_log` | Log of all AS400 API calls |
| `tb_assy_mock_done` | Dev tool — simulate lot completion |
| `tb_master_assy_status` | Status master with process grouping |
| `tb_master_process` | Process master |

### Key Table: tb_assy_lot

```sql
id            INT           PK IDENTITY
lot_no        VARCHAR(15)   NOT NULL UNIQUE
wos           VARCHAR(10)
qty           INT
tag_id        VARCHAR(50)
status_id     INT           FK → tb_master_assy_status.id
location_name VARCHAR(100)  -- Reader location e.g. "GAUGING ROOM F1"
machine_no    VARCHAR(30)   -- Machine from AS400 poll
emp_id        VARCHAR(10)   -- Employee who last changed status manually
remark        VARCHAR(255)
cleared_at    DATETIME
updated_at    DATETIME
created_at    DATETIME
```

### Key Table: tb_assy_log

```sql
id            INT           PK IDENTITY
lot_no        VARCHAR(15)
tag_id        VARCHAR(50)
event_type    VARCHAR(50)   -- REGISTER | GAUGING_ROOM_F1 | MC_GAUGING_F1 | COMPLETED | CHANGE_PROCESS
location_name VARCHAR(100)
machine_no    VARCHAR(30)
emp_id        VARCHAR(10)
remark        VARCHAR(255)
created_at    DATETIME
```

### Master Tables

```sql
-- tb_master_assy_status
id | status    | label_status     | process_id
1  | bf_issue  | Before Issue     | 1
2  | gr_f1     | Gauging Room F1  | 2
3  | mc_f1     | MC Gauging F1    | 2
4  | completed | Completed        | NULL

-- tb_master_process
id | process_code | process_name
1  | 1400         | BEFORE ISSUE
2  | 1410         | GAUGING
```

### Indexes

```sql
-- Existing
IX_assy_lot_status_id   ON tb_assy_lot(status_id)
IX_assy_lot_updated     ON tb_assy_lot(updated_at)
IX_assy_lot_tag         ON tb_assy_lot(tag_id)

-- Recommended to add
CREATE INDEX IX_assy_log_lot    ON tb_assy_log(lot_no)
CREATE INDEX IX_assy_tag_lot    ON tb_assy_tag(lot_no)
CREATE INDEX IX_assy_api_log_ts ON tb_assy_api_log(created_at)
```

---

## 6. API Endpoints

Base URL: `http://{server}:5001/api/assembly`

### LOT

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/lot/:lot_no` | Fetch lot info from AS400 |
| GET | `/lot-by-tag/:tag_id` | Fetch active lot from DB by tag_id |
| GET | `/lot-by-lot/:lot_no` | Fetch active lot from DB by lot_no |

### PROCESS

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| POST | `/register-tag` | `{tag_id, lot_no, wos, brg_type, spec, qty}` | Register lot + bind tag |
| POST | `/gauging-room-f1` | `{tag_id, location_name}` | Reader 1 auto-scan |
| POST | `/mc-gauging-f1` | `{tag_id, location_name}` | Reader 2 auto-scan |
| POST | `/change-process` | `{tag_id, status_id, location_name, remark, emp_id}` | Admin override |
| POST | `/completed` | `{lot_no, remark, emp_id, machine_no}` | Complete + clear tag |

### DASHBOARD

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard` | Summary cards + top5 + lot list |
| GET | `/dashboard/history` | Detail tab — filtered lot list |
| GET | `/dashboard/process-summary` | Inventory QTY by process |
| GET | `/dashboard/locations` | Location list from reader_config.json |

### CLEAR TAG

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/clear-tag/history` | Clear tag history |

### MANAGEMENT

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/login` | Authenticate user |
| GET/POST/PUT/DELETE | `/login/users` `/login/users/:id` | User CRUD |
| GET/POST/PUT/DELETE | `/status` `/status/:id` | Status CRUD |
| GET/POST/PUT/DELETE | `/process` `/process/:id` | Process CRUD |
| GET/PUT | `/readers-config` | Read/write reader_config.json |
| GET | `/readers-status` | Reader status from Python |
| POST | `/readers-restart` | Restart Python service |

### MOCK (Dev Only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST/DELETE | `/mock-done` `/mock-done/:lot_no` | Simulate lot completion |

---

## 7. Stored Procedures

### Process SPs

| SP | Caller | Validates |
|----|--------|-----------|
| `Stored_tb_assy_register` | Register page | LOT_ALREADY_EXISTS, TAG_IN_USE |
| `Stored_tb_assy_gauging_room_f1` | Python Reader 1 | Must come from status_id=1 |
| `Stored_tb_assy_mc_gauging_f1` | Python Reader 2 | Must come from status_id=2 |
| `Stored_tb_assy_change_process` | Admin manual | No order enforcement |
| `Stored_tb_assy_completed` | Polling / Admin | Must come from status_id=3 |
| `Stored_tb_assy_lot_by_tag` | Backend | Accepts tag_id OR lot_no (dual param) |

### Dashboard SPs

| SP | Returns |
|----|---------|
| `Stored_tb_assy_dashboard` | 3 recordsets: summary, top5, lot list |
| `Stored_tb_assy_dashboard_history` | Filtered lot list |
| `Stored_tb_assy_dashboard_process_summary` | QTY grouped by process |
| `Stored_tb_assy_clear_tag_history` | Completed lots with emp_id, remark |

### Master SPs

| SP | Description |
|----|-------------|
| `Stored_tb_master_assy_status_*` | Status CRUD (includes process_id) |
| `Stored_tb_master_process_*` | Process CRUD |
| `Stored_tb_assy_login_verify` | Auth — returns user row |
| `Stored_tb_assy_login_*` | User CRUD |
| `Stored_tb_assy_api_log_insert` | Insert API call log |
| `Stored_tb_assy_mock_done_*` | Dev mock |

---

## 8. Installation & Setup

### Prerequisites

| Software | Requirement | Notes |
|----------|------------|-------|
| Node.js | v18+ | Backend |
| Python | 3.x **32-bit** | Required for SID DLL |
| SQL Server | 2019+ | Windows Auth enabled |

### 1. Database Setup

Run all SP scripts. Then seed master tables:

```sql
INSERT INTO tb_master_process (process_code, process_name) VALUES
('1400', 'BEFORE ISSUE'), ('1410', 'GAUGING')

INSERT INTO tb_master_assy_status (status, label_status, process_id) VALUES
('bf_issue',  'Before Issue',    1),
('gr_f1',     'Gauging Room F1', 2),
('mc_f1',     'MC Gauging F1',   2),
('completed', 'Completed',       NULL)
```

### 2. Backend

```bash
cd backend
npm install
# Edit database.js — update server name and database name
# Edit .env — add API_TOKEN and API_RECEIVE_URL
node server.js
```

### 3. Frontend

```bash
cd frontend
npm install
npm install xlsx echarts echarts-for-react
npm start        # development
npm run build    # production
```

### 4. Python Service

```bash
cd service
# Must use 32-bit Python
python -m pip install fastapi uvicorn httpx
python main_assy.py       # run directly
python start_rfid.py      # with auto-restart
# Or double-click start_rfid.vbs on Windows
```

---

## 9. Environment Variables

### `backend/.env`

```env
PORT=5001

# AS400 API
API_TOKEN=Bearer xxxxxxxxxxxxxxxx
API_RECEIVE_URL=http://eweb8.ay.minebea.local:8087/BearingAYDataApi/api/v1/assembly/GaugeRec/gauge-receiving
API_PROD_RESULT_URL=        # ⚠️ PENDING — not yet provided by IT
```

> Database uses **Windows Authentication** — no DB credentials in `.env`.
> Update `server` and `database` values directly in `backend/database.js`.

### `frontend/src/config/constance.js`

```js
const API = {
    BACKEND: 'http://{server_ip}:5001/api/assembly',
};
export default API;
```

---

## 10. Features Status

### ✅ Completed

| Feature | Notes |
|---------|-------|
| Register lot + RFID tag | Barcode → AS400 fetch → tag bind |
| Process tracking (auto) | Reader 1 → gr_f1, Reader 2 → mc_f1 |
| Process order enforcement | SP-level — cannot skip steps |
| Dashboard Summary tab | Cards: Total, Before Issue, Gauging Room F1, MC Gauging F1 |
| Dashboard Detail tab | Filter + table + location filter + Export Excel |
| Inventory Summary table | Process QTY + Export Excel |
| Clear Tag manual | Lot+Tag match check, process, remark, emp_id |
| Clear Tag history | Date filter |
| Management — Users | CRUD |
| Management — Status | CRUD with process_id |
| Management — Process | CRUD |
| Management — Reader Config | IP, power, location_name |
| Login / Session | sessionStorage, SecureRoute, admin/user roles |
| Sidebar | Auto-expand on hover |
| Python Service | Auto-connect, reconnect, cooldown 10s |
| Mock Done | Dev simulation tool |

### ❌ Not Yet Complete

| Feature | Blocked By |
|---------|-----------|
| AS400 auto-complete polling | `API_PROD_RESULT_URL` not provided by IT |
| Daily Inventory Gauging table | Gauging API not provided by IT |
| Auto Mail 7am Excel report | Email recipients not confirmed |
| U809 USB-L Python wrapper | SDK downloaded, not implemented |
| Production deployment | Firewall not open |

---

## 11. Pending / Blocked

| Item | What's needed | From |
|------|--------------|------|
| `API_PROD_RESULT_URL` | URL, parameters, response format | IT |
| Daily Inventory API | URL + response format | IT |
| Firewall OT → IT | Open port for AS400 API access | IT |
| Auto mail recipients | Email address list | Management |
| Machine name prefix list | Currently: AMT, AGL, FFL, AGG | User |

---

## 12. Known Issues

| Issue | Impact | Fix |
|-------|--------|-----|
| Plain text passwords | Low (OT network only) | Add bcrypt if exposed beyond OT |
| No session timeout | Session lives until tab closes | Add 8-hour timestamp check |
| `console.log` in code | Log noise | Remove before production |
| Python: one reader crash restarts all | ~15-20s downtime | Separate process per reader |
| Polling: 1 API call per lot per 30s | Heavy at high volume | Batch or filter |
| `tb_assy_log` grows indefinitely | Storage + performance | SQL Agent cleanup job |

---

## 13. Strengths & Weaknesses

### ✅ Strengths

- Process order enforced at DB level — cannot be bypassed via API
- All backend uses Stored Procedures — no inline SQL
- Reader auto-reconnect — recovers from disconnection automatically
- Role-based auth — clean admin vs user separation
- Extensible process design — new process needs only: master insert + new SP + endpoint + Python map entry
- `reader_config.json` editable from web UI without redeploying
- sessionStorage — clears automatically on browser close

### ❌ Weaknesses

- No JWT — sessionStorage inspectable in browser console
- Plain text passwords — not best practice
- Python must be 32-bit — limits server flexibility
- No automated tests
- Single Python process — one reader failure restarts all
- Dashboard numbers still small for TV/large monitor

---

## 14. Recommendations

### High Priority

1. **Implement polling** — Once IT provides `API_PROD_RESULT_URL`:
   - Use `machine_name` from `reader_config.json` for the mc_f1 reader
   - Machine name must start with: `AMT`, `AGL`, `FFL`, `AGG`
   - See `06_polling_flow.mermaid` for full logic

2. **Add DB cleanup job**:
```sql
DELETE FROM tb_assy_log     WHERE created_at < DATEADD(DAY, -90, GETDATE())
DELETE FROM tb_assy_api_log WHERE created_at < DATEADD(DAY, -90, GETDATE())
```

3. **Add missing indexes**:
```sql
CREATE INDEX IX_assy_log_lot    ON tb_assy_log(lot_no)
CREATE INDEX IX_assy_tag_lot    ON tb_assy_tag(lot_no)
CREATE INDEX IX_assy_api_log_ts ON tb_assy_api_log(created_at)
```

4. **Remove all `console.log` before production**

### Medium Priority

5. **Auto mail** — `node-cron` + `nodemailer`, 7am daily, 2-sheet Excel
6. **U809 USB-L wrapper** — build `sid_u809.py` following `sid_u861.py` pattern
7. **TV dashboard** — increase card font to `text-6xl` or `text-7xl`
8. **Session timeout** — store login timestamp, check on each route

### Low Priority

9. **Separate Python process per reader**
10. **Add bcrypt** — when exposed beyond OT network

---

## 15. Authentication & Authorization

### Login Flow

```
emp_id + password
→ POST /api/assembly/login
→ SP: Stored_tb_assy_login_verify
→ { result: 'OK', user: { id, emp_id, eng_name, eng_surname, position } }
→ sessionStorage: 'assy_user'
→ Clears on browser/tab close
```

### Role Matrix

| Page | user | admin |
|------|------|-------|
| Dashboard | ✅ no login | ✅ |
| Register | ✅ | ✅ |
| Mock Done | ✅ no login | ✅ |
| Clear Tag | ❌ | ✅ |
| Management | ❌ | ✅ |

### Position Values

Stored **lowercase** in DB: `admin` / `user`

### SecureRoute in App.js

```jsx
// user or admin
<Route path="assembly/register" element={
    <SecureRoute><RegisterSingle /></SecureRoute>
} />

// admin only
<Route path="assembly/management" element={
    <SecureRoute adminOnly={true}><Management /></SecureRoute>
} />
<Route path="assembly/clear-tag" element={
    <SecureRoute adminOnly={true}><ClearTag /></SecureRoute>
} />
```

---

## 16. Reader Configuration

File: `service/reader_config.json` — editable from web UI (Management → Reader Config)

```json
[
  {
    "type": "gr_f1",
    "location_name": "GAUGING ROOM F1",
    "enabled": true,
    "ip": "192.168.1.xxx",
    "power": 10
  },
  {
    "type": "mc_f1",
    "location_name": "MC GAUGING F1",
    "machine_name": "AMT-001",
    "enabled": true,
    "ip": "192.168.1.xxx",
    "power": 10
  }
]
```

| Field | Description |
|-------|-------------|
| `type` | Maps to Node.js endpoint: `gr_f1` → `/gauging-room-f1`, `mc_f1` → `/mc-gauging-f1` |
| `location_name` | Stored in `tb_assy_lot.location_name` on each scan |
| `machine_name` | Sent with AS400 poll — must start with AMT / AGL / FFL / AGG |
| `enabled` | If false, Python skips this reader |
| `ip` | Reader IP — Python connects outbound via TCP port 6000 |
| `power` | RF power in dBm |

---

## 17. Diagrams

All diagrams are in the `/diagrams` folder as Mermaid files.
Paste any file into [mermaid.live](https://mermaid.live) to render and export as PNG/SVG.

| File | Description |
|------|-------------|
| `01_process_flow.mermaid` | Full lot lifecycle — Register to Completed with all error conditions |
| `02_er_diagram.mermaid` | All database tables and relationships |
| `03_architecture.mermaid` | System components and connections |
| `04_python_service_flow.mermaid` | Python reconnect_loop, scan_loop, FastAPI |
| `05_auth_flow.mermaid` | Login, SecureRoute, roles, session lifecycle |
| `06_polling_flow.mermaid` | AS400 auto-complete polling logic |

See `diagrams/README_DIAGRAMS.md` for viewing instructions.

---

*Last updated: August 2026*
*Developed by: DX Staff — NHT BEARING*
*Version: TEST (pre-production)*
