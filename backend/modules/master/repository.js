const PROCESS_COLUMNS = ['id', 'process_code', 'process_name', 'can_clear_tag'];
const LOCATION_COLUMNS = ['id', 'location_code', 'location_name', 'process_id', 'is_active', 'created_at'];
const STATUS_COLUMNS = ['id', 'status_code', 'status_label', 'seq', 'location_id'];

const selectList = (columns) => columns.join(', ');
const outputList = (columns) => columns.map((c) => `INSERTED.${c}`).join(', ');

const selectProcesses = async (db) => {
    const out = await db.query(
        `SELECT ${selectList(PROCESS_COLUMNS)}
         FROM tb_master_process
         ORDER BY process_code`);
    return out.recordset;
};

const insertProcess = async (db, { process_code, process_name, can_clear_tag }) => {
    const out = await db.query(
        `INSERT INTO tb_master_process (process_code, process_name, can_clear_tag)
         OUTPUT ${outputList(PROCESS_COLUMNS)}
         VALUES (@process_code, @process_name, @can_clear_tag)`,
        { process_code, process_name, can_clear_tag });
    return out.recordset[0];
};

const updateProcess = async (db, id, { process_code, process_name, can_clear_tag }) => {
    const out = await db.query(
        `UPDATE tb_master_process
         SET process_code = @process_code, process_name = @process_name, can_clear_tag = @can_clear_tag
         OUTPUT ${outputList(PROCESS_COLUMNS)}
         WHERE id = @id`,
        { id, process_code, process_name, can_clear_tag });
    return out.recordset[0] ?? null;
};

const deleteProcess = async (db, id) => {
    const out = await db.query(`DELETE FROM tb_master_process WHERE id = @id`, { id });
    return out.rowsAffected[0];
};

const selectLocations = async (db) => {
    const out = await db.query(
        `SELECT l.id, l.location_code, l.location_name, l.process_id, l.is_active, l.created_at,
                p.process_code, p.process_name
         FROM tb_master_location l
         JOIN tb_master_process p ON p.id = l.process_id
         ORDER BY l.location_code`);
    return out.recordset;
};

const insertLocation = async (db, { location_code, location_name, process_id, is_active }) => {
    const out = await db.query(
        `INSERT INTO tb_master_location (location_code, location_name, process_id, is_active)
         OUTPUT ${outputList(LOCATION_COLUMNS)}
         VALUES (@location_code, @location_name, @process_id, @is_active)`,
        { location_code, location_name, process_id, is_active });
    return out.recordset[0];
};

const updateLocation = async (db, id, { location_code, location_name, process_id, is_active }) => {
    const out = await db.query(
        `UPDATE tb_master_location
         SET location_code = @location_code, location_name = @location_name,
             process_id = @process_id, is_active = @is_active
         OUTPUT ${outputList(LOCATION_COLUMNS)}
         WHERE id = @id`,
        { id, location_code, location_name, process_id, is_active });
    return out.recordset[0] ?? null;
};

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
    const out = await db.query(`DELETE FROM tb_master_assy_status WHERE id = @id`, { id });
    return out.rowsAffected[0];
};

module.exports = {
    selectProcesses, insertProcess, updateProcess, deleteProcess,
    selectLocations, insertLocation, updateLocation,
    selectStatuses, selectStatusById, insertStatus, updateStatus, deleteStatus,
};
