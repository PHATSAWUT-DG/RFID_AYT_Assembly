const STATUS_COLUMNS = ['id', 'status_code', 'status_label', 'seq', 'location_id'];

const selectList = (columns) => columns.join(', ');
const outputList = (columns) => columns.map((c) => `INSERTED.${c}`).join(', ');

// A status may have no location (CLEARED), so the joins are LEFT.
const selectStatuses = async (db) => {
    const out = await db.query(
        `SELECT s.id, s.status_code, s.status_label, s.seq, s.location_id,
                l.location_code, l.location_name, l.process_id, p.process_code
         FROM tb_master_assy_status s
         LEFT JOIN tb_master_location l ON l.id = s.location_id
         LEFT JOIN tb_master_process p ON p.id = l.process_id
         ORDER BY s.seq, s.id`);
    return out.recordset;
};

const selectStatusById = async (db, id) => {
    const out = await db.query(
        `SELECT ${selectList(STATUS_COLUMNS)}
         FROM tb_master_assy_status
         WHERE id = @id`,
        { id });
    return out.recordset[0] ?? null;
};

const insertStatus = async (db, { status_code, status_label, seq, location_id }) => {
    const out = await db.query(
        `INSERT INTO tb_master_assy_status (status_code, status_label, seq, location_id)
         OUTPUT ${outputList(STATUS_COLUMNS)}
         VALUES (@status_code, @status_label, @seq, @location_id)`,
        { status_code, status_label, seq, location_id });
    return out.recordset[0];
};

const updateStatus = async (db, id, { status_code, status_label, seq, location_id }) => {
    const out = await db.query(
        `UPDATE tb_master_assy_status
         SET status_code = @status_code, status_label = @status_label, seq = @seq, location_id = @location_id
         OUTPUT ${outputList(STATUS_COLUMNS)}
         WHERE id = @id`,
        { id, status_code, status_label, seq, location_id });
    return out.recordset[0] ?? null;
};

const deleteStatus = async (db, id) => {
    const out = await db.query('DELETE FROM tb_master_assy_status WHERE id = @id', { id });
    return out.rowsAffected[0];
};

module.exports = { selectStatuses, selectStatusById, insertStatus, updateStatus, deleteStatus };
