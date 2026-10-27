-- Backend redesign B1.1: every table for B1-B5, plus seed.
-- Spec: docs/superpowers/specs/2026-10-01-backend-redesign-design.md (5.2, 5.3).
-- Runbook: docs/runbooks/dev-database-setup.md
--
-- No USE line: select the target database first (SSMS dropdown or `sqlcmd -d <db>`).
-- All or nothing: one transaction. If any of these tables already exists, nothing runs.
-- Filtered indexes need ANSI_NULLS and QUOTED_IDENTIFIER ON in every session that writes
-- these tables. The mssql driver and SSMS default to ON.
-- Rollback: create_assy_core.down.sql (drops all data).

SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
GO

-- NOEXEC carries to the next batches, so the main batch only compiles.
IF OBJECT_ID('dbo.tb_master_process') IS NOT NULL
    OR OBJECT_ID('dbo.tb_master_location') IS NOT NULL
    OR OBJECT_ID('dbo.tb_master_assy_status') IS NOT NULL
    OR OBJECT_ID('dbo.tb_assy_lot') IS NOT NULL
    OR OBJECT_ID('dbo.tb_assy_tag') IS NOT NULL
    OR OBJECT_ID('dbo.tb_assy_pairing') IS NOT NULL
    OR OBJECT_ID('dbo.tb_assy_pairing_event') IS NOT NULL
    OR OBJECT_ID('dbo.tb_assy_unknown_read') IS NOT NULL
    OR OBJECT_ID('dbo.tb_assy_login') IS NOT NULL
    OR OBJECT_ID('dbo.tb_assy_api_log') IS NOT NULL
    OR OBJECT_ID('dbo.tb_assy_mock_as400') IS NOT NULL
    OR OBJECT_ID('dbo.tb_assy_mock_done') IS NOT NULL
BEGIN
    RAISERROR('create_assy_core: a target table already exists. Nothing was changed. Run create_assy_core.down.sql first for a clean schema.', 16, 1);
    SET NOEXEC ON;
END
GO

BEGIN TRANSACTION;

-- =====================================================================
-- Master data
-- =====================================================================

CREATE TABLE dbo.tb_master_process (
    id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_master_process PRIMARY KEY,
    process_code  VARCHAR(10) NOT NULL CONSTRAINT UQ_master_process_code UNIQUE,
    process_name  VARCHAR(50) NOT NULL,
    can_clear_tag BIT NOT NULL CONSTRAINT DF_master_process_can_clear_tag DEFAULT 0
);

CREATE TABLE dbo.tb_master_location (
    id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_master_location PRIMARY KEY,
    location_code VARCHAR(20) NOT NULL CONSTRAINT UQ_master_location_code UNIQUE,
    location_name VARCHAR(100) NOT NULL,
    process_id    INT NOT NULL CONSTRAINT FK_master_location_process REFERENCES dbo.tb_master_process (id),
    is_active     BIT NOT NULL CONSTRAINT DF_master_location_is_active DEFAULT 1,
    created_at    DATETIME2(0) NOT NULL CONSTRAINT DF_master_location_created_at DEFAULT SYSDATETIME()
);

CREATE TABLE dbo.tb_master_assy_status (
    id           INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_master_assy_status PRIMARY KEY,
    status_code  VARCHAR(30) NOT NULL CONSTRAINT UQ_master_assy_status_code UNIQUE,
    status_label VARCHAR(50) NOT NULL,
    seq          INT NOT NULL,
    location_id  INT NULL CONSTRAINT FK_master_assy_status_location REFERENCES dbo.tb_master_location (id),
    -- D18 / D19: every active status has a location; CLEARED has none, so a scan never clears.
    CONSTRAINT CK_master_assy_status_location_rule CHECK (
        (status_code = 'CLEARED' AND location_id IS NULL)
        OR (status_code <> 'CLEARED' AND location_id IS NOT NULL))
);

CREATE UNIQUE INDEX UX_master_assy_status_location
    ON dbo.tb_master_assy_status (location_id) WHERE location_id IS NOT NULL;

-- =====================================================================
-- Lot, tag, pairing, journey
-- =====================================================================

CREATE TABLE dbo.tb_assy_lot (
    id                INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_assy_lot PRIMARY KEY,
    lot_no            VARCHAR(15) NOT NULL CONSTRAINT UQ_assy_lot_lot_no UNIQUE,
    wos               VARCHAR(20) NULL,
    brg_type          VARCHAR(30) NULL,
    spec              VARCHAR(20) NULL,
    qty               INT NULL,
    fetched_at        DATETIME2(0) NOT NULL,
    status_id         INT NOT NULL CONSTRAINT FK_assy_lot_status REFERENCES dbo.tb_master_assy_status (id),
    status_updated_at DATETIME2(0) NOT NULL CONSTRAINT DF_assy_lot_status_updated_at DEFAULT SYSDATETIME(),
    last_seen_at      DATETIME2(0) NULL,
    created_at        DATETIME2(0) NOT NULL CONSTRAINT DF_assy_lot_created_at DEFAULT SYSDATETIME()
);

CREATE INDEX IX_assy_lot_wos ON dbo.tb_assy_lot (wos);
CREATE INDEX IX_assy_lot_status ON dbo.tb_assy_lot (status_id) INCLUDE (qty, wos, brg_type);

CREATE TABLE dbo.tb_assy_tag (
    id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_assy_tag PRIMARY KEY,
    tag_code   VARCHAR(50) NOT NULL CONSTRAINT UQ_assy_tag_code UNIQUE,
    is_active  BIT NOT NULL CONSTRAINT DF_assy_tag_is_active DEFAULT 1,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_assy_tag_created_at DEFAULT SYSDATETIME()
);

CREATE TABLE dbo.tb_assy_pairing (
    id        INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_assy_pairing PRIMARY KEY,
    lot_id    INT NOT NULL CONSTRAINT FK_pairing_lot REFERENCES dbo.tb_assy_lot (id),
    tag_id    INT NOT NULL CONSTRAINT FK_pairing_tag REFERENCES dbo.tb_assy_tag (id),
    paired_by VARCHAR(10) NOT NULL,
    paired_at DATETIME2(0) NOT NULL CONSTRAINT DF_pairing_paired_at DEFAULT SYSDATETIME(),
    closed_at DATETIME2(0) NULL,
    closed_by VARCHAR(10) NULL
);

-- D1: at most one active pair per lot and per tag.
CREATE UNIQUE INDEX UX_pairing_active_lot ON dbo.tb_assy_pairing (lot_id) WHERE closed_at IS NULL;
CREATE UNIQUE INDEX UX_pairing_active_tag ON dbo.tb_assy_pairing (tag_id) WHERE closed_at IS NULL;
CREATE INDEX IX_pairing_lot ON dbo.tb_assy_pairing (lot_id, paired_at);

-- Append-only: no UPDATE or DELETE, ever.
CREATE TABLE dbo.tb_assy_pairing_event (
    id             BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_assy_pairing_event PRIMARY KEY,
    pairing_id     INT NOT NULL CONSTRAINT FK_event_pairing REFERENCES dbo.tb_assy_pairing (id),
    event_type     VARCHAR(20) NOT NULL CONSTRAINT CK_event_type CHECK (event_type IN ('PAIRED', 'SCANNED', 'CLEARED')),
    from_status_id INT NULL CONSTRAINT FK_event_from_status REFERENCES dbo.tb_master_assy_status (id),
    to_status_id   INT NOT NULL CONSTRAINT FK_event_to_status REFERENCES dbo.tb_master_assy_status (id),
    location_id    INT NULL CONSTRAINT FK_event_location REFERENCES dbo.tb_master_location (id),
    source         VARCHAR(10) NOT NULL CONSTRAINT CK_event_source CHECK (source IN ('web', 'reader', 'job')),
    emp_id         VARCHAR(10) NULL,
    remark         VARCHAR(255) NULL,
    is_abnormal    BIT NOT NULL CONSTRAINT DF_event_is_abnormal DEFAULT 0,
    created_at     DATETIME2(3) NOT NULL CONSTRAINT DF_event_created_at DEFAULT SYSDATETIME()
);

CREATE INDEX IX_event_pairing ON dbo.tb_assy_pairing_event (pairing_id, created_at);
CREATE INDEX IX_event_created ON dbo.tb_assy_pairing_event (created_at) INCLUDE (event_type, to_status_id, is_abnormal);

CREATE TABLE dbo.tb_assy_unknown_read (
    id            INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_assy_unknown_read PRIMARY KEY,
    tag_code      VARCHAR(50) NOT NULL,
    location_id   INT NOT NULL CONSTRAINT FK_unknown_read_location REFERENCES dbo.tb_master_location (id),
    first_seen_at DATETIME2(0) NOT NULL,
    last_seen_at  DATETIME2(0) NOT NULL,
    read_count    INT NOT NULL CONSTRAINT DF_unknown_read_read_count DEFAULT 1,
    CONSTRAINT UQ_unknown_read_tag_location UNIQUE (tag_code, location_id)
);

-- =====================================================================
-- Support tables (O1): login, API log, dev-only mock data
-- =====================================================================

CREATE TABLE dbo.tb_assy_login (
    id          INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_assy_login PRIMARY KEY,
    emp_id      VARCHAR(10) NOT NULL CONSTRAINT UQ_assy_login_emp_id UNIQUE,
    eng_name    VARCHAR(100) NULL,
    eng_surname VARCHAR(100) NULL,
    password    VARCHAR(72) NOT NULL, -- bcrypt hash
    position    VARCHAR(50) NULL
);

CREATE TABLE dbo.tb_assy_api_log (
    id               BIGINT IDENTITY(1,1) NOT NULL CONSTRAINT PK_assy_api_log PRIMARY KEY,
    api_type         VARCHAR(20) NOT NULL,
    method           VARCHAR(10) NULL,
    url              VARCHAR(500) NULL,
    request_params   VARCHAR(500) NULL,
    request_body     VARCHAR(MAX) NULL,
    http_status      INT NULL,
    status           VARCHAR(20) NULL,
    response         VARCHAR(MAX) NULL,
    error_msg        VARCHAR(500) NULL,
    response_time_ms INT NULL,
    created_at       DATETIME2(3) NOT NULL CONSTRAINT DF_api_log_created_at DEFAULT SYSDATETIME()
);

CREATE INDEX IX_api_log_created ON dbo.tb_assy_api_log (created_at);

CREATE TABLE dbo.tb_assy_mock_as400 (
    id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_assy_mock_as400 PRIMARY KEY,
    lot_no     VARCHAR(15) NOT NULL CONSTRAINT UQ_mock_as400_lot_no UNIQUE,
    wos        VARCHAR(20) NULL,
    brg_type   VARCHAR(30) NULL,
    spec       VARCHAR(20) NULL,
    qty        INT NULL,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_mock_as400_created_at DEFAULT SYSDATETIME()
);

CREATE TABLE dbo.tb_assy_mock_done (
    id         INT IDENTITY(1,1) NOT NULL CONSTRAINT PK_assy_mock_done PRIMARY KEY,
    lot_no     VARCHAR(15) NOT NULL CONSTRAINT UQ_mock_done_lot_no UNIQUE,
    created_at DATETIME2(0) NOT NULL CONSTRAINT DF_mock_done_created_at DEFAULT SYSDATETIME()
);

-- =====================================================================
-- Seed. Ids are looked up by code: code refers to rows by code, never by id.
-- =====================================================================

INSERT INTO dbo.tb_master_process (process_code, process_name, can_clear_tag)
VALUES ('1500', 'GAUGING', 1);

INSERT INTO dbo.tb_master_location (location_code, location_name, process_id)
SELECT v.location_code, v.location_name, p.id
FROM (VALUES
        ('bf_gr_f1', 'Before Gauging Room F1'),
        ('gr_f1',    'Gauging Room F1'),
        ('mc_f1',    'MC Gauging F1')
     ) AS v (location_code, location_name)
CROSS JOIN dbo.tb_master_process AS p
WHERE p.process_code = '1500';

INSERT INTO dbo.tb_master_assy_status (seq, status_code, status_label, location_id)
SELECT v.seq, v.status_code, v.status_label, l.id
FROM (VALUES
        (2, 'REGISTERED', 'Registered',      'bf_gr_f1'),
        (3, 'GR_F1',      'Gauging Room F1', 'gr_f1'),
        (4, 'MC_F1',      'MC Gauging F1',   'mc_f1'),
        (5, 'CLEARED',    'Cleared',         NULL)
     ) AS v (seq, status_code, status_label, location_code)
LEFT JOIN dbo.tb_master_location AS l ON l.location_code = v.location_code;

COMMIT TRANSACTION;
GO

SET NOEXEC OFF;
GO
