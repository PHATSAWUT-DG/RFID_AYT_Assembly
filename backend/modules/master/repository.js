const selectProcesses = async (db) => {
    const out = await db.query(
        `SELECT id, process_code, process_name, can_clear_tag
         FROM tb_master_process
         ORDER BY process_code`);
    return out.recordset;
};

const insertProcess = async (db, { process_code, process_name, can_clear_tag }) => {
    const out = await db.query(
        `INSERT INTO tb_master_process (process_code, process_name, can_clear_tag)
         OUTPUT INSERTED.id, INSERTED.process_code, INSERTED.process_name, INSERTED.can_clear_tag
         VALUES (@process_code, @process_name, @can_clear_tag)`,
        { process_code, process_name, can_clear_tag });
    return out.recordset[0];
};

const updateProcess = async (db, id, { process_code, process_name, can_clear_tag }) => {
    const out = await db.query(
        `UPDATE tb_master_process
         SET process_code = @process_code, process_name = @process_name, can_clear_tag = @can_clear_tag
         OUTPUT INSERTED.id, INSERTED.process_code, INSERTED.process_name, INSERTED.can_clear_tag
         WHERE id = @id`,
        { id, process_code, process_name, can_clear_tag });
    return out.recordset[0] ?? null;
};

const deleteProcess = async (db, id) => {
    const out = await db.query(`DELETE FROM tb_master_process WHERE id = @id`, { id });
    return out.rowsAffected[0];
};

const LOCATION_COLUMNS = 'id, location_code, location_name, process_id, is_active, created_at';
const LOCATION_OUTPUT = LOCATION_COLUMNS.split(', ').map((c) => `INSERTED.${c}`).join(', ');

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
         OUTPUT ${LOCATION_OUTPUT}
         VALUES (@location_code, @location_name, @process_id, @is_active)`,
        { location_code, location_name, process_id, is_active });
    return out.recordset[0];
};

const updateLocation = async (db, id, { location_code, location_name, process_id, is_active }) => {
    const out = await db.query(
        `UPDATE tb_master_location
         SET location_code = @location_code, location_name = @location_name,
             process_id = @process_id, is_active = @is_active
         OUTPUT ${LOCATION_OUTPUT}
         WHERE id = @id`,
        { id, location_code, location_name, process_id, is_active });
    return out.recordset[0] ?? null;
};

module.exports = {
    selectProcesses, insertProcess, updateProcess, deleteProcess,
    selectLocations, insertLocation, updateLocation,
};
