USE [db_rfid_assembly]
GO
ALTER PROCEDURE [dbo].[Stored_tb_assy_clear_tag_history]
    @date_from DATE = NULL,
    @date_to   DATE = NULL
AS BEGIN
    SET NOCOUNT ON;
    SELECT TOP 200
        l.lot_no, l.tag_id, l.emp_id, l.remark,
        l.cleared_at, l.updated_at,
        w.brg_type, w.spec
    FROM tb_assy_lot l
    LEFT JOIN tb_assy_wos w ON w.wos = l.wos
    WHERE l.status_id = 4
        AND (@date_from IS NULL OR CAST(l.cleared_at AS DATE) >= @date_from)
        AND (@date_to   IS NULL OR CAST(l.cleared_at AS DATE) <= @date_to)
    ORDER BY l.cleared_at DESC
END
GO
