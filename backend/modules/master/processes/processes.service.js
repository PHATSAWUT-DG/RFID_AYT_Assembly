const { mapMasterErrors, orNotFound, assertAffected } = require('../master.errors');

const PROCESS_RULES = {
    uniques: { UQ_master_process_code: 'process_code' },
    refs: {},
    messages: {
        duplicate: 'Process code already exists',
        invalidRef: 'Referenced row does not exist',
        inUse: 'Process is still used by a location',
    },
};

const createProcessesService = ({ repo, db }) => {
    const listProcesses = () => repo.selectProcesses(db);

    const createProcess = (input) => repo.insertProcess(db, input);

    const updateProcess = async (id, input) => {
        const row = await repo.updateProcess(db, id, input);
        return orNotFound(row, 'Process', id);
    };

    const deleteProcess = async (id) => {
        const affected = await repo.deleteProcess(db, id);
        assertAffected(affected, 'Process', id);
    };

    // SQL constraint errors from any of these become AppError (PROCESS_RULES).
    return mapMasterErrors(PROCESS_RULES, { listProcesses, createProcess, updateProcess, deleteProcess });
};

module.exports = { createProcessesService };
