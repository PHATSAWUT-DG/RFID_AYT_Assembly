USE [db_rfid_assembly]
GO
-- Every process starts at 0: Clear Tag rejects all lots until an admin flags a process.
ALTER TABLE [dbo].[tb_master_process]
    ADD [can_clear_tag] BIT NOT NULL
    CONSTRAINT [DF_tb_master_process_can_clear_tag] DEFAULT 0
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

    DECLARE @tag_id VARCHAR(50), @status_id INT
    SELECT @tag_id = tag_id, @status_id = status_id FROM tb_assy_lot WHERE lot_no = @lot_no

    IF @tag_id IS NULL
    BEGIN SELECT 'LOT_NOT_FOUND' AS result RETURN END

    -- Status 4 can belong to a clearable process too; excluding it stops a lot being cleared twice
    IF @status_id = 4 OR NOT EXISTS (
        SELECT 1 FROM tb_master_assy_status s
        JOIN tb_master_process p ON p.id = s.process_id
        WHERE s.id = @status_id AND p.can_clear_tag = 1)
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
