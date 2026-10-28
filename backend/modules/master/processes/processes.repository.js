const PROCESS_COLUMNS = ['id', 'process_code', 'process_name', 'can_clear_tag'];

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
    const out = await db.query('DELETE FROM tb_master_process WHERE id = @id', { id });
    return out.rowsAffected[0];
};

module.exports = { selectProcesses, insertProcess, updateProcess, deleteProcess };
