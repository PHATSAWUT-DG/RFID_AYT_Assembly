-- Creates the empty dev database. The schema lives in one place only:
-- next, select db_rfid_assembly_dev and run backend/sql/create_assy_core.sql.
-- Runbook: docs/runbooks/dev-database-setup.md

IF DB_ID('db_rfid_assembly_dev') IS NULL
BEGIN
    CREATE DATABASE db_rfid_assembly_dev;
END
GO
