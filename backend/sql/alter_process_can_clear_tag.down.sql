USE [db_rfid_assembly]
GO
ALTER PROCEDURE [dbo].[Stored_tb_assy_completed]
    @lot_no    VARCHAR(15),
    @remark    VARCHAR(500) = NULL,
    @emp_id    VARCHAR(50)  = NULL,
    @machine_no VARCHAR(30) = NULL
AS BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM tb_master_assy_status WHERE id = 4)
    BEGIN SELECT 'INVALID_STATUS' AS result RETURN END

    DECLARE @tag_id VARCHAR(50)
    SELECT @tag_id = tag_id FROM tb_assy_lot WHERE lot_no = @lot_no

    IF @tag_id IS NULL
    BEGIN SELECT 'LOT_NOT_FOUND' AS result RETURN END

	IF (SELECT status_id FROM tb_assy_lot WHERE lot_no = @lot_no) != 3
	BEGIN SELECT 'INVALID_PROCESS' AS result RETURN END

    UPDATE tb_assy_lot SET
        status_id  = 4,
        cleared_at = GETDATE(),
        updated_at = GETDATE(),
        remark     = @remark,
        emp_id     = @emp_id,
        machine_no = @machine_no
    WHERE lot_no = @lot_no

    UPDATE tb_assy_tag SET
        status     = 'cleared',
        cleared_at = GETDATE()
    WHERE lot_no = @lot_no AND status = 'active'

    INSERT INTO tb_assy_log (lot_no, tag_id, event_type, remark, emp_id, machine_no)
    VALUES (@lot_no, @tag_id, 'COMPLETED', @remark, @emp_id, @machine_no)

    SELECT 'OK' AS result
END
GO
-- The SP no longer reads the column, so it can go. The flag values are lost.
ALTER TABLE [dbo].[tb_master_process] DROP CONSTRAINT [DF_tb_master_process_can_clear_tag]
GO
ALTER TABLE [dbo].[tb_master_process] DROP COLUMN [can_clear_tag]
GO
