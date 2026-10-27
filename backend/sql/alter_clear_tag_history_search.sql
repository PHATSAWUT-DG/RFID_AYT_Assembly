USE [db_rfid_assembly]
GO
ALTER PROCEDURE [dbo].[Stored_tb_assy_clear_tag_history]
    @date_from DATE = NULL,
    @date_to   DATE = NULL,
    @search    VARCHAR(50) = NULL
AS BEGIN
    SET NOCOUNT ON;
    -- Escape LIKE wildcards so user input matches literally
    DECLARE @pattern VARCHAR(160) = CASE WHEN NULLIF(LTRIM(RTRIM(@search)), '') IS NULL THEN NULL
        ELSE '%' + REPLACE(REPLACE(REPLACE(REPLACE(LTRIM(RTRIM(@search)),
            '\', '\\'), '%', '\%'), '_', '\_'), '[', '\[') + '%' END;

    SELECT TOP 200
        l.lot_no, l.tag_id, l.emp_id, l.remark,
        l.cleared_at, l.updated_at,
        w.brg_type, w.spec
    FROM tb_assy_lot l
    LEFT JOIN tb_assy_wos w ON w.wos = l.wos
    WHERE l.status_id = 4
        AND (@date_from IS NULL OR CAST(l.cleared_at AS DATE) >= @date_from)
        AND (@date_to   IS NULL OR CAST(l.cleared_at AS DATE) <= @date_to)
        AND (@pattern IS NULL
            OR l.lot_no   LIKE @pattern ESCAPE '\'
            OR l.tag_id   LIKE @pattern ESCAPE '\'
            OR l.emp_id   LIKE @pattern ESCAPE '\'
            OR w.brg_type LIKE @pattern ESCAPE '\')
    ORDER BY l.cleared_at DESC
END
GO
