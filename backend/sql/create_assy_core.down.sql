-- Rollback for create_assy_core.sql.
-- DANGER: drops every table create_assy_core.sql created, WITH ALL DATA,
-- including the users in tb_assy_login. Needs explicit confirmation every run.
--
-- No USE line: select the target database first.
-- All or nothing: one transaction. Tables that do not exist are skipped.

SET XACT_ABORT ON;
GO

BEGIN TRANSACTION;

-- Reverse FK order.
IF OBJECT_ID('dbo.tb_assy_mock_done') IS NOT NULL     DROP TABLE dbo.tb_assy_mock_done;
IF OBJECT_ID('dbo.tb_assy_mock_as400') IS NOT NULL    DROP TABLE dbo.tb_assy_mock_as400;
IF OBJECT_ID('dbo.tb_assy_api_log') IS NOT NULL       DROP TABLE dbo.tb_assy_api_log;
IF OBJECT_ID('dbo.tb_assy_login') IS NOT NULL         DROP TABLE dbo.tb_assy_login;
IF OBJECT_ID('dbo.tb_assy_unknown_read') IS NOT NULL  DROP TABLE dbo.tb_assy_unknown_read;
IF OBJECT_ID('dbo.tb_assy_pairing_event') IS NOT NULL DROP TABLE dbo.tb_assy_pairing_event;
IF OBJECT_ID('dbo.tb_assy_pairing') IS NOT NULL       DROP TABLE dbo.tb_assy_pairing;
IF OBJECT_ID('dbo.tb_assy_tag') IS NOT NULL           DROP TABLE dbo.tb_assy_tag;
IF OBJECT_ID('dbo.tb_assy_lot') IS NOT NULL           DROP TABLE dbo.tb_assy_lot;
IF OBJECT_ID('dbo.tb_master_assy_status') IS NOT NULL DROP TABLE dbo.tb_master_assy_status;
IF OBJECT_ID('dbo.tb_master_location') IS NOT NULL    DROP TABLE dbo.tb_master_location;
IF OBJECT_ID('dbo.tb_master_process') IS NOT NULL     DROP TABLE dbo.tb_master_process;

COMMIT TRANSACTION;
GO
