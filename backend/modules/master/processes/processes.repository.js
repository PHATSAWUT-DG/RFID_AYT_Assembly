// db is the ORM context from db.js: { sequelize, tx }. Every call passes transaction: db.tx.
const PROCESS_COLUMNS = ['id', 'process_code', 'process_name', 'can_clear_tag'];

const processModel = (db) => db.sequelize.models.MasterProcess;
const plain = (row) => row.get({ plain: true });

const selectProcesses = (db) =>
    processModel(db).findAll({
        attributes: PROCESS_COLUMNS,
        order: [['process_code', 'ASC']],
        raw: true,
        transaction: db.tx,
    });

const insertProcess = async (db, { process_code, process_name, can_clear_tag }) => {
    const row = await processModel(db).create(
        { process_code, process_name, can_clear_tag },
        { transaction: db.tx });
    return plain(row);
};

// returning: true makes mssql add OUTPUT INSERTED.*, so an unknown id gives no row.
const updateProcess = async (db, id, { process_code, process_name, can_clear_tag }) => {
    const [, rows] = await processModel(db).update(
        { process_code, process_name, can_clear_tag },
        { where: { id }, returning: true, transaction: db.tx });
    return rows[0] ? plain(rows[0]) : null;
};

const deleteProcess = (db, id) => processModel(db).destroy({ where: { id }, transaction: db.tx });

module.exports = { selectProcesses, insertProcess, updateProcess, deleteProcess };
