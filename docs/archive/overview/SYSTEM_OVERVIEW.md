# RFID Assembly System — System Overview

> This document explains how the system works end-to-end,
> what each component does, and how data flows through each process step.
> Read this before diving into the code.

---

## What is this system?

The RFID Assembly System tracks bearing lots through the assembly and gauging process at NHT Bearing factory.

Each lot is physically tied to an RFID tag. As the lot moves through the production line, RFID readers automatically detect it and update its status in real-time. The dashboard lets supervisors and admin monitor all lots at a glance.

---

## How each process step works

### 1. Register — ลงทะเบียน lot

```
Operator scans Lot Barcode at the screen
↓
React sends lot_no to Node.js
↓
Node.js calls AS400 API → fetches lot info (wos, brg_type, spec, qty)
↓
Operator scans RFID Tag to bind with the lot
↓
Node.js INSERT into tb_assy_lot (status_id = 1 / bf_issue)
↓
INSERT tb_assy_tag (status = active)
INSERT tb_assy_log (event = REGISTER)
```

**Key rule:** Lot info only stays in React state until a tag is scanned. Nothing is saved to DB until both lot and tag are confirmed.

---

### 2. Gauging Room F1 — เข้าห้อง Gauging

```
Operator places lot on conveyor → passes RFID Reader 1
↓
Python detects tag_id + location_name = "GAUGING ROOM F1"
↓
Python sends POST /gauging-room-f1 to Node.js
↓
Node.js validates: must come from status_id = 1 (bf_issue)
  → if wrong step: returns INVALID_PROCESS_ORDER → Python skips silently
  → if correct: UPDATE tb_assy_lot (status_id = 2, location_name)
↓
INSERT tb_assy_log (event = GAUGING_ROOM_F1)
```

---

### 3. MC Gauging F1 — เข้าเครื่อง MC Gauging

```
Lot passes RFID Reader 2 on conveyor exit
↓
Python detects tag_id + location_name = "MC GAUGING F1"
↓
Python sends POST /mc-gauging-f1 to Node.js
↓
Node.js validates: must come from status_id = 2 (gr_f1)
  → if wrong step: returns INVALID_PROCESS_ORDER → Python skips silently
  → if correct: UPDATE tb_assy_lot (status_id = 3, location_name)
↓
INSERT tb_assy_log (event = MC_GAUGING_F1)
↓
Node.js begins polling AS400 every 30s for this lot
⚠️ Polling is PENDING — IT has not provided API_PROD_RESULT_URL yet
```

---

### 4. Completed — จบงาน

**Path A — Auto (AS400 polling)**

```
Node.js polls AS400 every 30s
↓
Sends lot_no + machine_name (from reader_config.json)
machine_name must start with: AMT / AGL / FFL / AGG
↓
AS400 confirms lot exists in their system
↓
Node.js calls SP: Stored_tb_assy_completed
↓
UPDATE tb_assy_lot (status_id = 4, cleared_at, machine_no)
UPDATE tb_assy_tag (status = cleared)
INSERT tb_assy_log (event = COMPLETED)
↓
Tag is now free to be reused on a new lot
```

**Path B — Manual (Admin Clear Tag)**

```
Admin opens Clear Tag page
↓
Enter Lot No. → system shows lot info from DB
Enter Tag ID → system shows tag info from DB
↓
System checks: does lot.tag_id === tag.tag_id?
  → NOT MATCH: cannot proceed
  → MATCH: can continue
↓
Select which Process this lot came from
Enter Remark (reason) + Employee ID
↓
Click Clear Tag → same SP as auto path
↓
UPDATE tb_assy_lot + tb_assy_tag + INSERT tb_assy_log
```

---

## Component Roles

| Component | Role | Analogy |
|-----------|------|---------|
| **Python** | Watches RFID readers 24/7, sends tag events to Node.js | Eyes |
| **Node.js** | Receives events, validates, updates DB, polls AS400 | Brain |
| **SQL Server** | Stores every lot, tag, and event permanently | Memory |
| **React** | UI for operators (Register) and admin (Dashboard, Clear Tag, Management) | Face |
| **AS400** | Factory ERP — source of lot info and completion confirmation | Authority |

---

## Process Order Summary

The system enforces strict step order at the **Stored Procedure level**.
A tag scanned at the wrong reader returns `INVALID_PROCESS_ORDER` and is skipped silently.
Admin can override any step manually using the Change Process function.

```
status_id = 1  →  status_id = 2  →  status_id = 3  →  status_id = 4
  bf_issue           gr_f1             mc_f1            completed
  Before Issue    Gauging Room F1   MC Gauging F1    Tag Cleared
  [Register]      [Reader 1 auto]   [Reader 2 auto]  [AS400 poll / Admin]
```

---

## Data written at each step

| Step | Table | Action |
|------|-------|--------|
| Register | `tb_assy_wos` | INSERT if WOS not exists |
| Register | `tb_assy_lot` | INSERT — status_id=1 |
| Register | `tb_assy_tag` | INSERT — status=active |
| Register | `tb_assy_log` | INSERT — event=REGISTER |
| Gauging Room F1 | `tb_assy_lot` | UPDATE — status_id=2, location_name |
| Gauging Room F1 | `tb_assy_log` | INSERT — event=GAUGING_ROOM_F1 |
| MC Gauging F1 | `tb_assy_lot` | UPDATE — status_id=3, location_name |
| MC Gauging F1 | `tb_assy_log` | INSERT — event=MC_GAUGING_F1 |
| Completed | `tb_assy_lot` | UPDATE — status_id=4, cleared_at, machine_no |
| Completed | `tb_assy_tag` | UPDATE — status=cleared |
| Completed | `tb_assy_log` | INSERT — event=COMPLETED |

---

*See `README.md` for full technical documentation.*
*See `diagrams/` for visual flow diagrams.*
