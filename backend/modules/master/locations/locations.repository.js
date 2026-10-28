const LOCATION_COLUMNS = ['id', 'location_code', 'location_name', 'process_id', 'is_active', 'created_at'];

const outputList = (columns) => columns.map((c) => `INSERTED.${c}`).join(', ');

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

module.exports = { selectLocations, insertLocation, updateLocation };
